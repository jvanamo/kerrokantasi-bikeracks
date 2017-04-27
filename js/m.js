L.LayerGroup.include({

    getLayerBy: function (key, value) {
      var found = false;
      this.eachLayer(function(layer) {  
        if (layer.feature.properties[key] == value) {
          found = layer;
          return true;
        }
      });
      return found;
    }

});

L.HeatLayer.prototype.getLatLng = function() {
  return (this.hasOwnProperty('_latlngs')) ? this._latlngs : [];
};

M = function(settings) {

  var self = this;

  this.canvas = L.map(settings.container, {
    closePopupOnClick: false,
    continuousWorld: true,
    crs: settings.crs,
    maxZoom: 15,
    minZoom: 3,
    layers: settings.layers,
    worldLatLngs: settings.worldLatLngs
  });
  
  this.blockers = L.featureGroup();
  this.clusters = L.markerClusterGroup({ 
    disableClusteringAtZoom: 13,
    showCoverageOnHover: false
  });
  this.features = L.featureGroup();
  this.heatmap = L.heatLayer();
  this.selected = L.featureGroup();
  this.visible = L.featureGroup();
  this.focused = null;
  
  this.filters = {};

  this.setInstanceId = function(id) {
    self.instanceId = id;
  }

  this.getInstanceId = function() {
    return self.instanceId;
  }

  this.setPurpose = function(purpose) {
    self.purpose = purpose;
  }

  this.getPurpose = function() {
    return self.purpose;
  }

  this.addGeoJSON = function(data) {  

    // A general function for registering feature data that comes in native GeoJSON format
    
    if (data.hasOwnProperty('type') && data.type == 'FeatureCollection') {
      
      L.geoJson(data, { 
        onEachFeature: function(feature, layer) {
          self.prepareLayer(layer);
        }
      });
    
    }

    self.update();

    return self;
  
  }

  this.addComment = function(event) {

    // A shortcut function for adding a temporary comment marker on canvas

    var selected = self.getSelected();
    var latlng = (selected) ? selected.getPopup().getLatLng() : event.latlng;

    // prevent dragging by setting draggable to false
    // n.b. leaflet messes up image uploading by closing the popup in wrong situations, so if dragging is not really needed, set to false
    var draggable = true;

    // delete marker when popup is closed
    var temporary = true;
   
    var layer = L.marker(latlng, { draggable: draggable }); 
    
    // Extend marker with GeoJSON like properties so that markers and polygons can be treated in same manner
    layer.feature = {
      properties : {
        'draggable'  : draggable,
        'template' : 'template-add-comment',
        'temporary' : temporary
      }
    }

    self.prepareLayer(layer);
    self.openPopup(layer, latlng);

    return layer;

  }

  this.prepareLayer = function(layer) {
    
    // A function for wiring common layer events and push the layer into the main container

    var feature = layer.feature;
    var geometry = feature.geometry;
    var properties = feature.properties;

    var style = properties.style;

    // Define hover styles for more complex shapes
    if (style) {
      
      layer.on('mouseover popupopen', function(e) {
        style.opacity = 1;
        this.setStyle(style);
      });
      
      layer.on('mouseout popupclose', function(e) {
        style.opacity = (this == self.getSelected()) ? 1 : .5;
        this.setStyle(style);
      });
    
    }

    // This is a layer that can be dragged, re-open the popup that is closed by the dragstart event 
    if (properties && properties.draggable === true) {

      layer.on('drag', function(e) {

        var blockers = self.blockers;

        var latlng = e.target.getLatLng();
        var clashing = leafletPip.pointInLayer(latlng, blockers, true); 
        
        if (clashing.length > 0) {
          // marker is above one or more non-allowed polygons
          // store a flag that prevents the canvas from adding a new marker where the drag ends
          layer.setLatLng(layer.latlng);
          //me.draggedOutside = true;
        } else {
          // all clear, clear flags and store current position 
          //me.draggedOutside = null;
          layer.latlng = latlng;
        }
      });

      layer.on('dragend', function(e) {

        layer.openPopup();
      
      });

    }

    if (properties && properties.blocker === true) {

      layer.on('click', function(e) { 
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
      });

      self.blockers.addLayer(layer);

    } else if (properties && properties.clickable === true) {

      layer.on('click', function(e) { 
        self.openPopup(layer, e.latlng);
      });

    }

    if (properties.temporary) {
      
      // Add temporary layer (new comment placeholders etc.) directly on map

      layer.on('popupclose', function(e) {

        // comment out to remove placeholders when their popups are closed
        self.canvas.removeLayer(layer);
        self.canvas.closePopup();

      });

      self.canvas.addLayer(layer);
    
    } else {

      // Otherwise check if there's data which needs to be overwritten
      if (properties.hasOwnProperty('id')) {
        
        var existing = self.features.getLayerBy('id', properties.id);
      
      }

      if (existing) {

        // Delete all layers that represent the outdated data

        self.canvas.removeLayer(existing);
        self.features.removeLayer(existing);

      }
      
      self.features.addLayer(layer);

    }

    return layer;

  }

  this.setSelected = function(layer) {

    self.selected = L.featureGroup();
    if (layer) self.selected.addLayer(layer);

    return self.getSelected();

  }

  this.getSelected = function(layer) {

    var selected = self.selected.getLayers();
    
    return (selected.length > 0) ? selected[0] : false;

  }

  this.openPopup = function(layer, latlng) {

    // A function for wiring additional behaviors to open popup event

    self.setSelected(layer);

    // Prepare stuff for popup
    var feature = layer.feature || event.target.feature;
    var properties = feature.properties;
    var focused = self.focused;
    
    var latlng = latlng || focused;

    //var popup = layer.getPopup() || L.popup({ closeButton: false, maxWidth: 240, minWidth: 240, maxHeight: 360 });    
    var popup = L.popup({ closeButton: false, maxWidth: 240, minWidth: 240, maxHeight: 400 });    

    layer.unbindPopup();
    layer.bindPopup(popup);

    if (layer.hasOwnProperty('_latlngs')) {
      
      // This is a complex layer with more than one latlngs, manually move popup to the clicked location 
      layer.openPopup(latlng);

    } else {

      // This is a simple layer with one latlng, let leaflet take care of the popup's location
      layer.openPopup(latlng);

    }

    // Store information about map's current focus after popup has been opened
    self.focused = latlng;
    self.canvas.clicked = new Date();
    
    return popup;

  }

  this.closePopup = function() {

    self.setSelected();
    self.canvas.closePopup();
    self.focused = null;

    return self;

  }

  this.update = function() {

    // A function for updating the data and UI after each change

    self.updateFeatures();
    self.updateLayers();

    var selected = self.getSelected();

    // if a popup was open, restore it
    if (selected) {

      self.openPopup(selected);
    
    }

    return self;
    
  }
	
	this.updateFeatures = function() {

    // A function for updating the data

		var dateStart = self.getFilter('dateStart') || 0;
		var dateEnd = self.getFilter('dateEnd') || new Date();
    var labels = self.getFilter('label') || [];
		
    var features = self.features;
    var visible = self.visible.clearLayers();

    var maxweight = 1;

    // reset all links and ratings
    features.eachLayer(function(layer) {
      layer.feature.properties.linked = [];
      layer.feature.properties.rating = {};
    });

    // Recalculate links based on current filtering
    features.eachLayer(function(layer) {

      var feature = layer.feature;
      var properties = feature.properties;
      
      var created_at = new Date(properties.created_at);
      //var label = properties.label || false;
      var permanent = properties.permanent || false;
      var linked_id = properties.linked_id || false;

      var weight = properties.weight || 1;

      maxweight = Math.max(maxweight, weight);

      // This feature is meant to be visible all the time, bypass other tests and break loop
      if (permanent) {
        visible.addLayer(layer);
        return true;
      }

      // This feature is out of date range, break loop
      if (dateStart > created_at || created_at > dateEnd) {
        return true;
      }

      // This feature didn't pass label filtering, break loop
      /*if (label.length > 0 && labels.indexOf(label.id) == -1) {
        return true;
      }*/

      /*
      // This feature provides additional information to other layers and is not meant to be visible on its own,
      // forward information to linked layers and break loop
      if (linked_id) {
        linked_id.forEach(function(id) {
          var link = features.getLayerBy('id', id);
          if (link) link.feature.properties.linked.push(layer);
        });
        return true;
      }
      */
      
      // All tests were passed, include the layer in the group of visible objects
      visible.addLayer(layer);
   
    });

    visible.maxweight = maxweight;
    
    return self;

	}

	this.updateLayers = function() {

    // A function for updating what's visible on the map

    var clusters = self.clusters;
    var features = self.features;
    var heatmap = self.heatmap;
    var purpose = self.getPurpose();
    var visible = self.visible;

    var latlngs = [];

    features.eachLayer(function(layer) {
      
      // This feature is not supposed to be visible at the moment, remove from canvas
      if (!visible.hasLayer(layer)) {
        self.canvas.removeLayer(layer);
        return true;
      }

      var feature = layer.feature;
      var geometry = feature.geometry;
      var properties = feature.properties;

      /*
      // If feature has connections to other features, determine its style based on the linked features
      var linked = properties.linked || [];
      if (linked.length > 0) {
        
        var colors = {};
        var rating = {};
        
        // Count the number of linked features and their labels, and store the label colors
        linked.forEach(function(link) {
          var label = link.feature.properties.label;
          var label_id = (typeof label === 'string') ? label : label.id; 
          var label_color = label.color || '#btn-info-light';
          if (!rating.hasOwnProperty(label_id)) {
            rating[label_id] = 1;
          } else {
            rating[label_id] ++;
          }
          colors[label_id] = label_color;
        })

        // Find the label that exists the most in the linked features, set that label's color as the main feature's style
        properties.style.color = colors[Object.keys(rating).sort(function(a,b) { return rating[b] - rating[a]; })[0]];

        // Store statistics of the linked features for further reference
        properties.rating = rating;
      
      } else if (properties.style) {
        properties.style.color = '#0078A8'; // brand-primary = 004485, brand-info = 04A1D4, kerrokantasi navbar = #005eb8
      }
      */

      if (properties.style) {
        properties.style.color = '#0078A8'
        layer.setStyle(properties.style);
      }

      /* 
      if (self.getPurpose() == 'postComments') {
        self.canvas.addLayer(layer);
      }
      */

      if (purpose == 'postComments' || purpose == 'viewComments') {
        clusters.addLayer(layer);
      } 

      if (purpose == 'viewHeatmap') {
        if (geometry.hasOwnProperty('type') && geometry.type == 'Point') {
          var latlng = layer.getLatLng();
          var intensity = properties.weight / visible.maxweight;
          var point = [latlng.lat, latlng.lng, intensity];
          latlngs.push(point);
        }
      }
      
    });
 
    if (purpose == 'postComments' || purpose == 'viewComments') {
      self.canvas.addLayer(clusters);
    }

    if (self.getPurpose() == 'viewHeatmap') {
      var heatmap = self.heatmap;
      var heatmapSettings = {
        blur    : 30,
        minOpacity  : 50,
        pane    : 'tilePane',
        radius    : 20,
        zIndex    : -1
      }
      
      heatmap.setLatLngs(latlngs);
      heatmap.setOptions(heatmapSettings);

      self.canvas.addLayer(heatmap);
      
    }

    return self;

	}
	
	this.updatePopups = function(event) {

    // A function for updating popup contents 
    // plugin specific implementation defined later

  }
	
  this.setFilter = function(key, value) {
    if (value) {
      self.filters[key] = value;
    } else {
      delete self.filters[key];
    }
    return self;
  }
  
  this.getFilter = function(key) {
    return (self.filters.hasOwnProperty(key)) ? self.filters[key] : '';
  }

  this.setCenter = function (latlng, zoom) {
    var zoom = zoom || 12;
    self.canvas.setView(latlng, zoom);
  }

  this.canvas.on('click', function(event) {
    
    // Clicking an empty spot will first set the focus on map.
    // Pressing enter (keyCode == 13) would then close the newly created popup.
    // Return false to prevent this
    
    if (event.originalEvent.keyCode == 13) return false;

    var clicked = this.clicked;
    var now = new Date();
    
    if (clicked > now - 50) {
      
      // A clicked layer propagated an unnecessary click event to canvas (possibly a Leaflet bug), do nothing
    
    } else {

      // Add a short timeout to distinguish between single and double clicks

      var now = this.clicked = new Date();
      var buffer = 200;

      // Proceed if there was only one click within the buffer period
      // Otherwise let the doubleclick event counter all actions

      setTimeout(function() {
        var clicked = self.canvas.clicked;
        var selected = self.getSelected();
        if (clicked > now - buffer) {
          if (selected) {
            if (selected.hasOwnProperty('feature') && selected.feature.hasOwnProperty('properties') && selected.feature.properties.temporary === true) {
              // remove temporary markers when canvas is clicked 
              self.canvas.removeLayer(selected);
            }
            self.closePopup();
          } else {
            // comment out to disable adding of new comments outside routes
            if (self.getPurpose() == 'postComments') {
              self.addComment(event); 
            }
          }
          self.canvas.clicked = new Date();
        }
       }, buffer);

    }

    return this;

  });

  this.canvas.on('dblclick', function(event){
    // Set clicked timestamp to zero to counter single click evetns
    self.canvas.clicked = 0;
  })

  this.canvas.on('popupopen', function(event) {
    // Add a helper class to body for hiding map controls while a popup is open 
    document.body.classList.add("leaflet-popup-open");
    // Render popup contents
    self.updatePopups(event);
  });

  this.canvas.on('popupclose', function(event) {
    // Remove helper class
    document.body.classList.remove("leaflet-popup-open");
  });

  /*
  // Try to locate user automatically
  this.canvas.locate({setView: true, maxZoom: 12});

  // If user's location is not found, set map center to settings.center
  this.canvas.on('locationerror', function(event){
    if (settings.center) { self.setCenter(settings.center, 9) }
  });
  */

  if (settings.center) { self.setCenter(settings.center, 9) }
  
  return this;

}


/// KERROKANTASI PYÖRÄTELINEET SPECIFIC STUFF

function pad(num, size) {
  var s = num+"";
  while (s.length < size) s = "0" + s;
  return s;
}

function parseBoundary(data, worldLL) {

  // convert boundary data coming from kerrokantasi-api into proper geojson objects (if necessary)

  if (data.hasOwnProperty('features')) {

    data.features.forEach(function(feature) {
      if (!feature.hasOwnProperty('properties'))
        feature.properties = {};
      feature.properties.blocker = true;
      feature.properties.permanent = true;
      feature.properties.style = {
        className : 'leaflet-click-dragblocker',
        clickable : true,
        color : '#000',
        fill : '#000',
        fillOpacity : .25,
        opacity: .25,
        weight: 1,
      }

      if (feature.hasOwnProperty('geometry') && feature.geometry.hasOwnProperty('coordinates') && feature.geometry.type == 'Polygon') {
        feature.geometry.coordinates.unshift(worldLL);
      }

    });
  
  }

  return data;

}

function parseComments(data) {
  
  // Convert comment data coming from kerrokantasi-api into proper geojson objects (if necessary)

  var featurecollection = {
    'type' : 'FeatureCollection',
    'features' : []
  }
  
  $.each(data, function(i, d) {
    
    // If geojson field refers to an existing object (field value is an id),
    // create an empty geojson point and link it to the object
    if (typeof d.geojson === 'object' && d.geojson !== null) {
      var feature = d.geojson;
    } else {
      var feature = {
        geometry: {
          coordinates: [0, 0],
          type: 'Point'
        },
        properties: {
          linked_id : [ d.geojson ] 
        },
        type: 'Feature'
      };
    }

    // Flip kerrokantasi comment fields into properties of a geojson feature
    if (!feature.hasOwnProperty('properties'))
      feature.properties = {};
    $.each(d, function(key, value) {
      if (key != 'geojson') {
        feature.properties[key] = value;
      }
    });

    // Include style information for determining which colors to use 
    /*if (feature.properties.hasOwnProperty('label')) {
      var label = feature.properties.label;
      if (label.id == 60) label.color = '#0B5';
      if (label.id == 61) label.color = '#F69930'; //F44
      feature.properties.title = (label.label) ? label.label : 'Muu palaute';
    } else {
      feature.properties.title = 'Muu palaute';
    }
    */

    feature.properties.title = 'Tähän tarvitaan teline';

    // Preformat property values for Handlebar templates
    feature.properties.n_votes = (feature.properties.hasOwnProperty('n_votes')) ? feature.properties.n_votes : 0;
    feature.properties.author_name = (feature.properties.hasOwnProperty('author_name')) ? feature.properties.author_name : 'Anonyymi';
    feature.properties.content = (feature.properties.hasOwnProperty('content')) ? '<p>' + feature.properties.content + '</p>': '';

    // include weight for heatmaps
    feature.properties.weight = (feature.properties.hasOwnProperty('n_votes')) ? feature.properties.n_votes + 1 : 1;
    
    if (feature.properties.hasOwnProperty('images') && feature.properties.images.length > 0) {
      feature.properties.image = feature.properties.images[0];
    }

    if (feature.properties.hasOwnProperty('linked_id') && typeof feature.properties.linked_id === 'string'){
      feature.properties.linked_id = [feature.properties.linked_id];
    }

    if (feature.properties.hasOwnProperty('created_at')) {
      feature.properties.date_object = new Date(feature.properties.created_at); 
    }

    if (feature.properties.hasOwnProperty('plugin_data') && feature.properties.plugin_data.hasOwnProperty('created_at')) {
      feature.properties.date_object = new Date(feature.properties.plugin_data.created_at);
      feature.properties.date_string = pad(feature.properties.date_object.getDate(), 2) + '.' + pad(1 + feature.properties.date_object.getMonth(), 2) + '.' + feature.properties.date_object.getFullYear() + ' ' + pad(feature.properties.date_object.getHours(), 2) + ':' + pad(feature.properties.date_object.getMinutes(), 2) + ':' + pad(feature.properties.date_object.getSeconds(), 2);
    }
    
    feature.properties.clickable = true;
    feature.properties.template = 'template-view-comment';
    
    featurecollection.features.push(feature);
  
  });

  return featurecollection;

}

function parseRoutes(data) {

  // Convert routedata coming from kerrokantasi-api into proper geojson objects (if necessary)

  if (data.hasOwnProperty('features')) {

    data.features.forEach(function(feature) {
      if (!feature.hasOwnProperty('properties'))
        feature.properties = {};
      feature.properties.permanent = true;
      feature.properties.style = {
        color: '#0078A8', // brand-primary = 004485, brand-info = 04A1D4, kerrokantasi navbar = #005eb8
        lineCap: 'round',
        opacity: .5,
        weight: 10
      }
      feature.properties.title = feature.properties.name;
      feature.properties.content = '<p>' + feature.properties.winter_mai + ' (' + feature.properties.winter_mai_1 + ')</p>';
      feature.properties.template = 'template-view-rating';
    });

  }

  return data;

}

function prepareComment(data) {

  // Convert comment object into a format understood by kerrokantasi-api

  var comment = {};

  comment.geojson = {
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Point",
      "coordinates": [0, 0]
    }
  }

  if (data.hasOwnProperty('latlng')) {
    comment.geojson.geometry.coordinates = [ data.latlng.lng, data.latlng.lat ];
  }

  if (data.hasOwnProperty('selected')) {
    var selected = data.selected;
    if (selected.hasOwnProperty('feature') && selected.feature.hasOwnProperty('properties') && selected.feature.properties.hasOwnProperty('id')) {
      comment.geojson.properties.linked_id = selected.feature.properties.id;
    }
  }

  if (data.hasOwnProperty('title')) {
    comment.title = data.title;
  }

  if (data.hasOwnProperty('content')) {
    comment.content = data.content || '';
  } else {
    comment.content = '';
  }

  if (data.hasOwnProperty('imageUrl')) {
    comment.image = { image : data.imageUrl };
    if (data.hasOwnProperty('imageCaption'))
      comment.image.caption = data.imageCaption;
  }

  /* if (data.hasOwnProperty('label')) {
    comment.label = { id : parseInt(data.label) };
  }
  */

  if (data.hasOwnProperty('date') && data.time !== undefined) {
    var date = data.date;
    var time = data.time.split(':');
    var created_at = new Date(date.setHours(parseInt(time[0]), parseInt(time[1]))).toISOString();
    comment.plugin_data = { created_at : created_at };
  }

  return { comment : comment };
  
}

function prepareVote(data) {

  // Convert vote object into a format understood by kerrokantasi-api

  var vote = {};

  if (data.hasOwnProperty('selected')) {
    var selected = data.selected;
    if (selected.hasOwnProperty('feature') && selected.feature.hasOwnProperty('properties') && selected.feature.properties.hasOwnProperty('id')) {
      return { commentId : selected.feature.properties.id };
    }
  }

  return {};

}

function updateFiltering() {

  // Update map filtering when user changes the sidebar inputs


  if ($('#filter-date-start').length > 0 && $('#filter-date-end').length > 0) {

    var start = new Date();
    var end = new Date();

    start.setDate(start.getDate() - 1);

    if (!$('#filter-date-start').val()) {
      $('#filter-date-start').datepicker('setDate', start);
    }

    if (!$('#filter-date-end').val()) {
      $('#filter-date-end').datepicker('setDates', end);
    }
  	
  	var startDate = $('#filter-date-start').datepicker('getDate');
  	var endDate = $('#filter-date-end').datepicker('getDate');
  	
  	var startUTC = startDate.setHours(0, 0, 0);
  	var endUTC = endDate.setHours(23, 59, 59);

    map.setFilter('dateStart', new Date(startUTC));
    map.setFilter('dateEnd', new Date(endUTC));

  }

  if ($('.js-filter-label:checked').length > 0) {

    var label = $.map($('.js-filter-label:checked'), function(d) { return $(d).data('label'); });

    map.setFilter('label', label);
  
  }

}

function messageParent(message, data) {

  if (data && message) {
    data.message = message;
    data.instanceId = instanceId;
  }

  window.parent.postMessage(data, '*');

}

function EPSG3067() {
  var bounds, crsName, crsOpts, originNw, projDef;
  crsName = 'EPSG:3067';
  projDef = '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
  bounds = L.bounds(L.point(-548576, 6291456), L.point(1548576, 8388608));
  originNw = [bounds.min.x, bounds.max.y];
  crsOpts = {
    resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125],
    bounds: bounds,
    transformation: new L.Transformation(1, -originNw[0], -1, originNw[1])
  };
  return new L.Proj.CRS(crsName, projDef, crsOpts);
}

// Init leaflet

var instanceId = null;

var tm35 = EPSG3067();
var worldSouthWest = tm35.projection.unproject(tm35.options.bounds.min);
var worldNorthEast = tm35.projection.unproject(tm35.options.bounds.max);
var worldLatLngs = [L.latLng(worldNorthEast.lat, worldNorthEast.lng), L.latLng(worldNorthEast.lat, worldSouthWest.lng), L.latLng(worldSouthWest.lat, worldNorthEast.lng), L.latLng(worldSouthWest.lat, worldSouthWest.lng)];
var worldLatLngArray = [[worldNorthEast.lng, worldNorthEast.lat], [worldSouthWest.lng, worldNorthEast.lat], [worldSouthWest.lng, worldSouthWest.lat], [worldNorthEast.lng, worldSouthWest.lat], [worldNorthEast.lng, worldNorthEast.lat]];
var worldOrigo = L.latLng((worldNorthEast.lat - worldSouthWest.lat) / 2, (worldNorthEast.lng - worldSouthWest.lng) / 2);

var tilelayer = L.tileLayer('https://geoserver.hel.fi/mapproxy/wmts/osm-sm-hq/etrs_tm35fin_hq/{z}/{x}/{y}.png');

var map = new M({
  center: [60.1708, 24.9375],
  container: 'map-canvas',
  crs: tm35,
  layers: [tilelayer],
  worldLatLngs: worldLatLngs
});

map.updatePopups = function(event) {

  // Function for populating popups in kerrokantasi/talvipyöräily

  var selected = map.getSelected();

  if (!selected) return false;

  var popup = selected.getPopup();
  var properties = selected.feature.properties;

  if (properties.hasOwnProperty('rating')) {
    properties.rating_60 = (properties.rating['60']) ? properties.rating['60'] : 0;
    properties.rating_61 = (properties.rating['61']) ? properties.rating['61'] : 0;
  }

  var template = Handlebars.compile($(document.getElementById(properties.template)).html());
  var html = template(properties);
  
  popup.setContent(html);

  if (event) {

    var latlng = event.popup.getLatLng() || event.latlng;

  }

  // define generic popup interactions

  var $popup = $(popup.getElement());

  $popup.on('click', '[data-action="add-comment"]', function(e) {
    e.preventDefault();
    map.addComment();
  });

  // rating = comment with a label that provides a positive or negative vote
  $popup.on('click', '[data-action="submit-rating"]', function(e) {
    e.preventDefault();
    var data = $(this).data();
    data.content = '';
    data.latlng = latlng;
    data.selected = selected;
    messageParent('userData', prepareComment(data));
    map.closePopup();
  });

  // vote = real kerrokantasi vote, a plain number without any quality
  $popup.on('click', '[data-action="submit-vote"]', function(e) {
    e.preventDefault();
    var data = {}
    data.selected = selected;
    messageParent('userVote', prepareVote(data));
    map.closePopup();
  });

  $popup.on('click', '[data-dismiss="popup"]', function(e) {
    e.preventDefault();
    /*
    if (properties.temporary === true && map.canvas.hasLayer(selected)) {
      // remove temporary markers when cancel button is explicitlty clicked
      map.canvas.removeLayer(selected);
    }
    */
    map.closePopup();
  });

  // define comment form specific interactions 
 
  var $imageResizer = $('#image-resizer');

  var $form = $popup.find('#form-add-comment');

  var $imageFile = $form.find('#form-add-comment-image-file');
  var $imageCaption = $form.find('#form-add-comment-image-caption');
  
  var $commentContent = $form.find('#form-add-comment-content');
  var $commentLabel = $form.find('#form-add-comment-label');

  var $commentDate = $form.find('#form-add-comment-date');
  var $commentTime = $form.find('#form-add-comment-time');

  var $formCancel = $form.find('#form-add-comment-cancel');
  var $formSubmit = $form.find('#form-add-comment-submit');

  var imageUploader = new CanvasImageUploader({ maxSize: 600, jpegQuality: 0.7 });

  var now = new Date();

  $commentDate.datepicker({
    autoclose: true,
    format: "dd.mm.yyyy",
    language: "fi",
    maxViewMode: 0,
    templates: {
        leftArrow: '<i class="fa fa-angle-left"></i>',
        rightArrow: '<i class="fa fa-angle-right"></i>'
    },
    todayHighlight: true
  });

  $commentDate.datepicker('setDate', now);

  $commentTime.timepicker({
    minuteStep: 5,
    showMeridian: false
  });

  $imageFile.on('change', function (e) {
    var files = e.target.files || e.dataTransfer.files;
    if (files) {
      $imageCaption.removeClass('hide');
      imageUploader.readImageToCanvas(files[0], $imageResizer, function () {
        imageUploader.saveCanvasToImageData($imageResizer[0]);
        $imageCaption.focus();
      });
    } else {
      $imageCaption.addClass('hide');
    }
  });

  $formSubmit.on('click', function(e) {
    e.preventDefault();
    var data = {};
    data.content = $commentContent.val() || '';
    data.label = $commentLabel.val();
    if ($imageResizer && $imageResizer.attr('width') && $imageResizer.attr('height')) {
      data.imageUrl = $imageResizer[0].toDataURL();
      data.imageCaption = $imageCaption.val();
      $imageResizer.removeAttr('width');
      $imageResizer.removeAttr('height');
    }
    data.date = $commentDate.datepicker('getDate');
    data.time = $commentTime.val();
    data.latlng = latlng;
    data.selected = selected;
    messageParent('userData', prepareComment(data));
    map.closePopup();
  });

  $form.on('change input', 'input, select, textarea', function(e) {
    // a simple validation for now... user must select a before the submit button becomes active 
    // $formSubmit.prop('disabled', !$commentLabel.val());
  });

  $form.on('submit', function(e) {
    e.preventDefault();
  });

  $form.on('reset', function(e) {
    e.preventDefault();
  });

}

// Define sidebar jquery elements and interactions

$(function() {
  
  $('.js-daterange').datepicker({
    autoclose: true,
    format: "dd.mm.yyyy",
    language: "fi",
    maxViewMode: 0,
    templates: {
        leftArrow: '<i class="fa fa-angle-left"></i>',
        rightArrow: '<i class="fa fa-angle-right"></i>'
    },
    todayHighlight: true
  });

  $('.js-filter-date').on('mousedown focus', function(e) {
    e.preventDefault();
    $(this).blur();
    $(this).datepicker('show');
  });

  $('.js-filter-date').on('blur', function(e) {
    $('.js-filter-date').datepicker('hide');
  });

  $('.js-filter-label').on('focus', function(e) {
    $('.js-filter-date').datepicker('hide');
  });

  $('.js-filter').on('change input', function() {
    updateFiltering();
    map.update();
  });

  $('[data-toggle="tab"]').on('click', function(e){
    $(window).trigger('resize');
  })

  $(document).on("keypress", ":input:not(textarea)", function(event) {
    return event.keyCode != 13;
  });
  
  updateFiltering();

});

// Subscribe to iframe postmessages

window.addEventListener('message', function(message) {    
 
  if (message.data.message == 'mapData' && message.data.instanceId) {
    
    instanceId = message.data.instanceId;

    map.setInstanceId(message.data.instanceId);
    map.setPurpose(message.data.pluginPurpose);

    if (message.data.hasOwnProperty('comments')) {
      map.addGeoJSON(parseComments(message.data.comments));
    }

    if (message.data.hasOwnProperty('data')) {
      var mapdata = JSON.parse(message.data.data);
      if (mapdata.hasOwnProperty('boundary'))
        map.addGeoJSON(parseBoundary(mapdata.boundary, worldLatLngArray));
      if (mapdata.hasOwnProperty('existing'))
        map.addGeoJSON(parseRoutes(mapdata.existing));
    }

  }

});