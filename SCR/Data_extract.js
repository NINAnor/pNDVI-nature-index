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

// This code is to extract data for modelling potential natural NDVI (P-NDVI) over Norway
// Data are masked to forest or mountain ecosystems using a map generated from AR5 and AR50 topographic data
// The data output includes a CSV file with dataframe of 
  // explanatory (climate + edaphic) and response (NDVI) data for each pixel within protected areas
// The data is downloaded and imported into R for plotting and accuracy assessment

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

// Define area of interest 
var fylker = ee.FeatureCollection('users/zandersamuel/NINA/Vector/Norway_counties_fylker_2019');
fylker = fylker.filterBounds(geometry2)
var aoi = fylker.geometry();

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
Map.addLayer(combinedMask, {palette:['white']}, 'combinedMask', 0);

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


//// Location data -------------------------------------------------------------------------
// Add pixel Lat-Lon as a feature to extract- this may be useful for plotting/mapping in R
var latlon = ee.Image.pixelCoordinates('EPSG:4326');
Map.addLayer(latlon, {min:40, max:60}, 'latlon',0)


/*
  // Extract data from protected areas ///////////////////////////////////////////////////////////////////
*/
// Combine all explanatory and response variables
var masterStack = terrainStack
  .addBands(soilStack)
  .addBands(climateStack)
  .addBands(ndviMedian)
  .addBands(latlon);
print(masterStack, 'masterStack')

// Mask image to ecosystem of interest and protected areas
var masterStackReference = masterStack.updateMask(combinedMask)

// Define a grid to extract data over 
  // This is done because GEE runs out of memory if you try reprojecting and extracting over whole of Norway
var samplingGrid = ee.Image.random().multiply(10000000).toInt32()
    .reduceToVectors({
      reducer: ee.Reducer.countEvery(),
      geometry: aoi.bounds(),
      geometryType: 'bb' ,
      eightConnected: false,
      scale: 200000,
      crs: 'EPSG:4326'
    });
Map.addLayer(samplingGrid.style({color:"00FF00", fillColor:"FF000000"}), {}, 'samplingGrid', 0);

var iterations = samplingGrid.size().getInfo()
print(iterations, 'number of grids')

// You have to manually click through the export tasks one by one
var list= samplingGrid.toList(1000);
for (var i = 0; i<iterations; i++){
  var aoiSelect = ee.Feature(list.get(i)).geometry();
  // Create random sample of pixels
  var sample = masterStackReference.sample({
    region: aoiSelect,
    scale: masterProjection.nominalScale(),
    projection: masterProjection,
    //numPixels: 100000000,
    seed: 123
  });
  
  Export.table.toDrive({
    collection: sample,
    description: 'features_PNDVI_' +String(ecosystem) + '_' + String(i),
    fileFormat: 'CSV'
  });

  
}

