var geometry = 
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[8.338570539281847, 59.187005620991876],
          [8.338570539281847, 58.60242786518174],
          [9.975533429906847, 58.60242786518174],
          [9.975533429906847, 59.187005620991876]]], null, false),
    geometry2 = 
    /* color: #98ff00 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[3.215155933457865, 61.57132014226585],
          [3.215155933457865, 57.369730993693395],
          [13.674140308457865, 57.369730993693395],
          [13.674140308457865, 61.57132014226585]]], null, false);

// Author: Zander Venter - zander.venter@nina.no

// This code is to plot the output from "RF_prediction.js" script
// It also aggregates the predicted pNDVI nature index for each county

// Ideally, we should create confidence intervals for the county-level estimates 
  // of pNDVI deviations. These could be incorporated from validation plot in R script


/*
  // Global Functions and objects ///////////////////////////////////////////////////////////////////
*/

// Function to add a legend to the map
function addCategoricalLegend(panel, dict, title) {
  
  // Create and add the legend title.
  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '18px',
      margin: '0 0 4px 0',
      padding: '0'
    }
  });
  panel.add(legendTitle);
  
  var loading = ui.Label('Loading legend...', {margin: '2px 0 4px 0'});
  panel.add(loading);
  
  // Creates and styles 1 row of the legend.
  var makeRow = function(color, name) {
    // Create the label that is actually the colored box.
    var colorBox = ui.Label({
      style: {
        backgroundColor: color,
        // Use padding to give the box height and width.
        padding: '8px',
        margin: '0 0 4px 0'
      }
    });
  
    // Create the label filled with the description text.
    var description = ui.Label({
      value: name,
      style: {margin: '0 0 4px 6px'}
    });
  
    return ui.Panel({
      widgets: [colorBox, description],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };
  
  // Get the list of palette colors and class names from the image.
  var palette = dict['colors'];
  var names = dict['names'];
  loading.style().set('shown', false);
  
  for (var i = 0; i < names.length; i++) {
    panel.add(makeRow(palette[i], names[i]));
  }
  
  Map.add(panel);
  
}

// Visualization dictionary for the legend function
var dict1 = {
  names: ['Low', 'Moderate', 'High'],
  colors:['#8C510A', '#F6E8C3','#01665E']
}
var dict2 = {
  names: ['Bad', 'Good'],
  colors:['red', 'blue']
}

// Some palettes
var virdis = 'FDE725, B5DE2C,6CCE59,35B779,35B779,1E9E89,25838E,31688E,3E4A89,472878,440154';
var brOr = ["#2D004B", "#542788", "#8073AC", "#B2ABD2", "#D8DAEB", "#FEE0B6", "#FDB863", "#E08214", "#B35806", "#7F3B08"]
var piyg = ["#8E0152" ,"#C51B7D" ,"#DE77AE", "#F1B6DA" , "#E6F5D0" ,"#B8E186", "#7FBC41" ,"#4D9221" ,"#276419"]
var brbg = ["#543005", "#8C510A", "#BF812D", "#DFC27D" ,"#F6E8C3", "#C7EAE5", "#80CDC1", "#35978F", "#01665E", "#003C30"]

var ndviDeviation = ee.Image('users/zandersamuel/NINA/Raster/p_ecological_condition_pNDVI_deviation_skog');
print(ndviDeviation, 'ndviDeviation')

// Define area of interest 
var fylker = ee.FeatureCollection('users/zandersamuel/NINA/Vector/Norway_counties_fylker_2019');
fylker = fylker.filterBounds(geometry2)
var aoi = fylker.geometry();

/*
  // Calculate ecosystem condition index //////////////////////////////////////////////////////////////////////
*/


// Rescale the deviation image to 5th and 95th percentile values of distribution
  // Could use min and max but there may be some extreme outliers that skew the rescaling
var minMax = ndviDeviation.reduceRegion({
  reducer:ee.Reducer.percentile([5,95]),
  geometry: aoi,
  scale: 1000,
  bestEffort: true
})//.getInfo();
minMax = ee.Dictionary(minMax)
print(minMax, 'min and max of deviation image')

// Now rescale t0 between 0 and 1
var min = minMax.get('ndvi_p5')
var max = minMax.get('ndvi_p95')
var deviationScaled = ndviDeviation.clamp(min, max).unitScale(min, max);

/*
  // Visualize results //////////////////////////////////////////////////////////////////////////////////////
*/

// Add legends in case you want to make screenshots or clip sections of screen for figures/PowerPoint
addCategoricalLegend(ui.Panel(), dict1, 'Continuous');
addCategoricalLegend(ui.Panel(), dict2, 'Binary');

// Add fylker
Map.addLayer(fylker, {}, 'counties', 0);

// Ecological condition continuous variable
Map.addLayer(deviationScaled, {min:0,max:1, palette: brbg}, 'ndvi deviation', 0);

print(ui.Chart.image.histogram(deviationScaled, aoi, 1000))

// Create binary output with anyting above 0.6 as "good condition" and below as "bad condition" 
  // visualized in red and blue, repsectively
var natureIndex = deviationScaled.gt(0.6);
Map.addLayer(natureIndex, {min:0,max:1, palette: ['red','blue']}, 'natureIndex', 0);


/*
  // Aggregate data over counties ////////////////////////////////////////////////////////////////////////
*/

// Get median ndvi deviation score for each fylker
var table = deviationScaled.reduceRegions({
  collection: fylker,
  reducer: ee.Reducer.median(),
  scale: ndviDeviation.projection().nominalScale()
});
// Remove geometry before export
table = table.map(function(ft){return ft.setGeometry(null)});
print(table)

var chart = ui.Chart.feature.byFeature(table, 'FYLKESNAVN', 'median').setChartType('ColumnChart')
print(chart)

// Export and download for use in R
Export.table.toDrive({
  collection:table,
  description: 'pNDVI_deviation_counties',
  fileFormat: 'CSV'
});