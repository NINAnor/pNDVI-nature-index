# pNDVI-nature-index
Assessing ecological condition based on deviation between observed and potential NDVI over Norway

### Introduction
This is a first-attempt to estimate ecological condition for forest and mountain (only forest is covered in current implementation) ecosystems in Norway. We use the Potential Natural Vegetation (PNV; https://peerj.com/articles/5457/) concept and apply it to NDVI. Essentially we are using protected areas over Norway to define a reference NDVI state. Data for NDVI (response) and climatic + edaphic (explanatory) variables in reference areas are used to train a Random Forest regression model. This model is used to predict what pNDVI (potential NDVI) could/should be outside of protected areas. The ecosystem condition is then defined as the difference between the pNDVI and the observed NDVI.

### Scope
In the current implementation, the scope includes:
* response variable: median NDVI
* temporal: NDVI aggregated over 2018-2020
* spatial: 10 counties in southern Norway. Scripts only cover forest ecosystem type. Mountain can easily be added

### Data inputs
* MODIS ndvi - https://developers.google.com/earth-engine/datasets/catalog/MODIS_006_MOD13Q1
* Terrain model - https://kartkatalog.geonorge.no/metadata/height-dtm-10-2018/19cf1687-4ed6-45ec-9f5b-fae13a61e71b
* Bioclim climate data - https://developers.google.com/earth-engine/datasets/catalog/WORLDCLIM_V1_BIO
* Soil data - https://developers.google.com/earth-engine/datasets/catalog/OpenLandMap_SOL_SOL_ORGANIC-CARBON_USDA-6A1C_M_v02

* forest and mountain ecosystems defined by ecosystem map from AR5 and AR50 resource maps in Norway
* norwegian county (fykler) administrative units used for data aggregation

### Workflow
The workflow spans two platforms - RStudio and Google Earth Engine (GEE) JavaScript API. Data therefore needs to be moved manually between the two via download from Google Drive and upload to GEE asset from JavaScript API.

The GEE script "pNDVI_demo_run.js" is a self-contained workflow which runs the whole pNDVI analysis on-the-fly in GEE, albeit for a limited area. It is useful to walk through this script to see the logic behind the whole workflow. This script could even be made into a GEE web-app where users can edit the parameters and run the analysis for their municipality/county. Can access snapshot of script here: https://code.earthengine.google.com/9395871e4e934f5e02ec35b5221dae0b

The remaining scripts break the pNDVI analysis down into manageable parts. These include:
1. "Data_extract.js" - extract abiotic (climate + edaphic) and NDVI data for selected ecosystem type within reference area (i.e. protected areas). Can also access snapshot here: https://code.earthengine.google.com/1ac5b147f339e639ace4dc9ba8ebba65
* run export task and download data from Google Drive and place in R project in appropriate folder
2. "Setup.R" and "RF_model_evaluation.R" - train a Random Forest regression model on data from GEE and evaluate performance. Generate a final training dataset for upload to GEE where inference is made over whole study area.
* upload output file to GEE asset
3. "RF_prediction.js" - Make predictions in GEE with a trainef RF model over the "non-reference" (i.e. outside protected area) area. Snapshot here: https://code.earthengine.google.com/2c85c1e86e863f6d47926a1f0511c0cf
* run export task to GEE Asset
4. "Output_visualise.js" - Calculate the difference between observed and predicted NDVI and rescale to nature index [0-1]. Visualize results and aggregate to counties. Snapshot here: https://code.earthengine.google.com/ed0a934c1819297364d81c88b43a6bf0

### Things you need to change in next iteration
* File directory paths in GEE scripts for both import and export - upon revision, they need to link to the asset location in your personal Asset folder
* Run model and exports for mountains (fjell) as well
* Incorporate error estimates on pNDVI scores
* Make final maps either by screenshots of GEE console, or by export and ggplot in RStudio


