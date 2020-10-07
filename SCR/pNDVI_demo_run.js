var geometry = 
    /* color: #d63000 */
    /* shown: false */
    /* displayProperties: [
      {
        "type": "rectangle"
      }
    ] */
    ee.Geometry.Polygon(
        [[[9.55802408055018, 60.03035143095291],
          [9.55802408055018, 58.94271123904251],
          [11.10709634617518, 58.94271123904251],
          [11.10709634617518, 60.03035143095291]]], null, false);

// Author: Zander Venter - zander.venter@nina.no

// This code is to perform a self-contained demo-run of the potential natural NDVI (P-NDVI) analysis
// It is meant to be run on a small area of interest (AOI) - not larger than 1 or 2 counties
// Data are masked to forest or mountain ecosystems using a map generated from AR5 and AR50 topographic data
// It performs the following steps on-the-fly for the AOI in Earth Engine:
  // 1. extract abiotic (climate + edaphic) and NDVI data for selected ecosystem type within reference area (i.e. protected areas)
  // 2. train a Random Forest regression model on these data with NDVI as response variable
  // 3. Make predictions with this model over the "non-reference" (i.e. outside protected area) area
  // 4. Calculate the difference between observed and predicted NDVI and rescale to nature index [0-1]

/*
  // Global Functions and objects ///////////////////////////////////////////////////////////////////
*/

// Cleans MODIS NDVI data
function getQABits(image, start, end, newName) {
    // Compute the bits we need to extract.
    var pattern = 0;
    for (var i = start; i <= end; i++) {
       pattern += Math.pow(2, i);
    }
    // Return a single band image of the extracted QA bits, giving the band
    // a new name.
    return image.select([0], [newName])
                  .bitwiseAnd(pattern)
                  .rightShift(start);
}
function qualityMask(image){
  
  var quality = getQABits(image.select('SummaryQA'),0,1,'internal_quality_flag');
  return image.updateMask(quality.eq(0).or(quality.eq(1))).copyProperties(image)
  
}
function rescaleMODIS(image){
  return image.divide(10000).copyProperties(image)
  
}

// Function to change images to common resolution - not really necessary as GEE handles that in background
function reduceImgResolution(image, reducer, projection){
  return image.reduceResolution(reducer, true).reproject(projection)
}

// Some palettes
var virdis = 'FDE725, B5DE2C,6CCE59,35B779,35B779,1E9E89,25838E,31688E,3E4A89,472878,440154';
var brOr = ["#2D004B", "#542788", "#8073AC", "#B2ABD2", "#D8DAEB", "#FEE0B6", "#FDB863", "#E08214", "#B35806", "#7F3B08"]
var piyg = ["#8E0152" ,"#C51B7D" ,"#DE77AE", "#F1B6DA" , "#E6F5D0" ,"#B8E186", "#7FBC41" ,"#4D9221" ,"#276419"]
var brbg = ["#543005", "#8C510A", "#BF812D", "#DFC27D" ,"#F6E8C3", "#C7EAE5", "#80CDC1", "#35978F", "#01665E", "#003C30"]

// Decide on temporal extent of NDVI data to aggregate over
var startDate = '2018-01-01';
var endDate = '2020-01-01';

// Decide on months of year to restrict NDVI data to
var startMOY = 6;
var endMOY = 9

// Define whether working in "skog" or "fjell" ecosystem
var ecosystem = 'skog'

// Define area of interest - start small for trouble shooting
var aoi = geometry

// Set map
Map.setOptions('HYBRID')
Map.centerObject(aoi)
Map.addLayer(aoi, {color:'red'}, 'AOI', 0)

/*
  // Gather datasets and map-check ///////////////////////////////////////////////////////////////////
*/
//// Define protected area reference areas ------------------------------------------------
var pas = ee.FeatureCollection('users/zandersamuel/NINA/Vector/Norway_protected_area');
Map.addLayer(pas, {}, 'protected area', 0);
print(pas.limit(10), 'protected area features');

///// NDVI -------------------------------------------------------------------------
var masterProjection = ee.ImageCollection("MODIS/006/MOD13Q1").first().projection();
print(masterProjection.nominalScale(), 'MODIS resolution');

var ndviCol = ee.ImageCollection("MODIS/006/MOD13Q1")
  .merge(ee.ImageCollection("MODIS/006/MYD13Q1"))
    .filterDate(startDate, endDate)
    .filter(ee.Filter.calendarRange(startMOY,endMOY, 'month'))
    .map(qualityMask)
    .map(rescaleMODIS)
    .select(['NDVI']);
//Print the collection to console to view number of images, band names and metadata properties    
print(ndviCol, 'ndviCol');
Map.addLayer(ndviCol, {min:0.2,max:0.9, palette: piyg}, 'ndviCol', 0);

var ndviMedian = ndviCol.median().rename('ndvi');


///// Define mask -------------------------------------------------------------------------
var ecoTypes = ee.Image("users/zandersamuel/NINA/Raster/Norway_ecosystem_types_Simon_5m")
var forest = ecoTypes.eq(101).or(ecoTypes.eq(102)).selfMask();
var alpine = ecoTypes.eq(201).or(ecoTypes.eq(202)).selfMask();

var ecosystemMask =  null;

if(ecosystem == 'skog'){
  ecosystemMask = forest
} else {
  ecosystemMask = alpine
}

//ecosystemMask = reduceImgResolution(ecosystemMask, ee.Reducer.mode(), masterProjection)
Map.addLayer(ecosystemMask, {palette:['#19b8f7']}, ecosystem, 0);

var PAmask  = ee.Image(0).byte().paint(pas, 1).selfMask();
//PAmask = PAmask.reproject(masterProjection)
Map.addLayer(PAmask, {palette:['red']}, 'PAmask', 0)

var combinedMask = PAmask.updateMask(ecosystemMask).rename('mask');
Map.addLayer(combinedMask, {palette:['white']}, 'reference area mask', 0);

///// Terrain data -------------------------------------------------------------------------
var dtm10 = ee.Image("users/rangelandee/NINA/Raster/Fenoscandia_DTM_10m");
dtm10 = dtm10.unmask(ee.Image(0)).rename('DTM_10m');
Map.addLayer(dtm10, {min:0, max:700, palette: virdis}, 'dtm', 0);
// Calculate terrain roughness
var dtm10_focal = dtm10.reduceNeighborhood(ee.Reducer.stdDev(), ee.Kernel.square(3)).rename('dtm10_focal');
var terrain10 = ee.Algorithms.Terrain(dtm10);

// Terrain stack
var terrainStack = terrain10
  .addBands(dtm10_focal);
terrainStack = terrainStack.reproject(dtm10.projection().atScale(50))
// Because terrain cannot be resampled up to MODIS resolution, we need to calcualte mean value
terrainStack = reduceImgResolution(terrainStack, ee.Reducer.mean(), masterProjection)
print(terrainStack, 'terrainStack');

Map.addLayer(terrainStack.select('aspect'), {min:0, max:180, palette: virdis}, 'aspect', 0);

///// Climate data -------------------------------------------------------------------------
var  bio_namesShort = ['MAT','t_di_range','iso','t_seas','t_max_wm','t_min_cm','t_an_range','t_wtq',
                  't_dq','t_wq','t_cq','MAP','p_wm','p_dm','p_seas','p_wtq','p_dq','p_wq','p_cq'];
var  bio_namesLong = ['temp_mean_annual','temp_diurnal_range','isothermality','temp_seasonality','temp_max_warmestMonth',
                  'temp_min_coldestMonth','temp_annual_range','temp_wettestQuart','temp_driestQuart',
                  'temp_warmestQuart','temp_coldestQuart','rain_mean_annual','rain_wettestMonth','rain_driestMonth',
                  'rain_seasonailty','rain_wettestQuart','rain_driestQuart','rain_warmestQuart','rain_coldestQuart'];
var climateStack = ee.Image('WORLDCLIM/V1/BIO').rename(bio_namesLong);
Map.addLayer(climateStack.select('temp_driestQuart'), {min:-100, max:100}, 'temp',0)
print(climateStack, 'climateStack');


///// Soil -------------------------------------------------------------------------
var bd = ee.Image("OpenLandMap/SOL/SOL_BULKDENS-FINEEARTH_USDA-4A1H_M/v02").select('b100').rename('soil_bd');
var ph = ee.Image("OpenLandMap/SOL/SOL_PH-H2O_USDA-4C1A2A_M/v02").select('b100').rename('soil_ph');
var sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select('b100').rename('soil_sand');
var carbon = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b100').rename('soil_carbon');

Map.addLayer(carbon, {min:0, max:50}, 'soil c', 0)
var soilStack = bd
  .addBands(ph)
  .addBands(sand)
  .addBands(carbon);
print(soilStack, 'soilStack');

/*
  // Extract data from protected areas ///////////////////////////////////////////////////////////////////
*/
// Combine all explanatory and response variables
var masterStack = terrainStack
  .addBands(soilStack)
  .addBands(climateStack)
  .addBands(ndviMedian)

// Create test stack with reduced set for debugging
masterStack = masterStack.select(['DTM_10m', 'aspect', 'soil_carbon', 'soil_sand', 'temp_mean_annual', 'rain_mean_annual', 'ndvi'])

print(masterStack, 'masterStack')

// Mask image to ecosystem of interest and protected areas
var masterStackReference = masterStack.updateMask(combinedMask)


// Create random sample of pixels
var sample = masterStackReference.sample({
  region: aoi,
  scale: masterProjection.nominalScale(),
  projection: masterProjection,
 // numPixels: 5000,
  seed: 123
});
print(sample, 'training/reference sample')


/*
  // Perform modelling ///////////////////////////////////////////////////////////////////
*/
var bands = masterStack.bandNames().remove('ndvi');
print(bands, 'explanatory band Names')

// Partition the training and testing datasets
sample = sample.randomColumn('random', 123)
var training = sample.filter(ee.Filter.lte('random', 0.6));
print('Training n =', training.aggregate_count('.all'));

var testing = sample.filter(ee.Filter.gt('random', 0.6));
print('Testing n =', testing.aggregate_count('.all'));


// Train Random Forest regression model
var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 70
  }).setOutputMode('REGRESSION')
  .train({
  features: training, 
  classProperty: 'ndvi', 
  inputProperties: bands
});

// Check accuracy by predicting against testing dataset
var validation = testing.classify(classifier, 'ndvi_predicted');

// Make regression chart
var valChart = ui.Chart.feature.byFeature(validation, 'ndvi_predicted', 'ndvi')
  .setChartType('ScatterChart')
var options = {
  title: 'Validation plot for protected areas within AOI',
  pointSize: 1,
  hAxis: {title: 'NDVI predicted'},
  vAxis: {title: 'NDVI observed'},
  legend: 'none',
  trendlines: { 0: {showR2: true, visibleInLegend: true, color:'#ff0000'} }    // Draw a trendline for data series 0.
};

print(valChart.setOptions(options))

// Classify entire image
var classified = masterStack.classify(classifier);

// Add to map
Map.addLayer(masterStack.select('ndvi'), {min:0.2,max:0.9, palette: piyg}, 'ndvi observed', 0)
Map.addLayer(classified, {min:0.2,max:0.9, palette: piyg}, 'ndvi predicted', 0)


/*
  // Calculate ecosystem condition index ///////////////////////////////////////////////////////////////////
*/


// Calculate difference between obsreved and predicted NDVI images
var ndviDeviation = masterStack.select('ndvi')
  .subtract(classified);

// Update the mask to the ecosystem type
ndviDeviation = ndviDeviation.updateMask(ecosystemMask).clip(aoi)

// Create a histogram to explore deviations over AOI
print('Histogram of NDVI deviation values over AOI', ui.Chart.image.histogram(ndviDeviation, aoi, 5000))

// Rescale the deviation image to 5th and 95th percentile values of distribution
  // Could use min and max but there may be some extreme outliers that skew the rescaling
var minMax = ndviDeviation.reduceRegion({
  reducer:ee.Reducer.percentile([5,95]),
  geometry: aoi,
  scale: masterProjection.nominalScale(),
  bestEffort: true
})//.getInfo();
minMax = ee.Dictionary(minMax)
print(minMax, 'min and max of deviation image')

// Now rescale t0 between 0 and 1
var min = minMax.get('ndvi_p5')
var max = minMax.get('ndvi_p95')
var deviationScaled = ndviDeviation.clamp(min, max).unitScale(min, max);
Map.addLayer(deviationScaled, {min:0,max:1, palette: brbg}, 'ndvi deviation', 0);

// Create binary output with anyting above 0.6 as "good condition" and below as "bad condition" 
  // visualized in red and blue, repsectively
var natureIndex = deviationScaled.gt(0.6);
Map.addLayer(natureIndex, {min:0,max:1, palette: ['red','blue']}, 'natureIndex', 0);
