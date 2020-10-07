
#### Introduction -----------------------------------------------------------------------
# This script received data that was exported from the Data_extract.js script in GEE
# Purpose of this script:
  # 1. Import and explore correlations between explanatory vars and NDVI
  # 2. Perform recursive feature elimination
  # 3. Run and evaluate Random Forest (RF) model
  # 4. Generate final training dataset for upload to GEE for model inference

# Things that I have not done, but which ideally should be done, in this script:
  # This script only performs the modelling for forest ("skog") data
  # I do not attempt to quantify prediction error. Ideally, one would make a separate model for each 
    # county or spatial management unit. Then you can define an uncertainty for each county.
    # These can be used to generate confidence intervals around final pNDVI condition maps
  # I have not done any hyperparameter tuning for RF model - tuning ntree, mtry using caret package 
      # For now I have used 100 trees and defaul RF settings
  # To get accurate error estimates, one should deal with spatial autocorrelation in RF modelling and evaluation
      # In this script I use randomized split between training and testing datasets
      # This tends to inflate model accuracy assessment
      # Ideally one should perform block cross-validation to prevent spatial autocorrelation
      # Read this for more info: https://onlinelibrary.wiley.com/doi/full/10.1111/ecog.02881

#### Import data and check --------------------------------------------------------------
features <- readMultiFiles('./DATA/Features_skog/') %>%
  dplyr::select(-'system:index', -'.geo') %>% 
  mutate(id = row_number())

# Define predictor (explanatory) variables
predVars <- colnames(features %>%
                       dplyr::select(-x, -y, -id, -ndvi))

# Quickly check their correlation with a corrleation matrix
matrix <- features %>%
  dplyr::select(-x, -y, -id)
M <- cor(as.data.frame(matrix))
corrplot(M, type = "upper", tl.cex=0.8, tl.col='#000000',
         col = brewer.pal(n = 8, name = "PuOr"))


#### Identify optimal number of predictors -------------------------------------------------
# This is a Recursive Feature Elimination (RFE) function in caret
# Important to prevent model over-fitting and make later model inference less 
  # computationally-intensive

# Create sub-sample of entire dataset for testing...
featuresSubset <- features %>% sample_n(20000)

# Define RFE parameters
control <- rfeControl(functions=rfFuncs, method="cv", number=5) # Sets control parameters
subsets <- c(1,2,5,10,15, 20, 25, 28) # Series of variable #s to iterate through

# run the RFE algorithm - will probably take an hour or two
results <- rfe(featuresSubset[,predVars], featuresSubset$ndvi, sizes=subsets, rfeControl=control)

# summarize the results
print(results)
plot(results, type=c("g", "o")) # 15 variables is optimal

results$optVariables
results$results

results$optVariables

# Going to go with top 10 variables because the gains in accuracy are very marginal after that
predVarsFinal <- c("soil_ph",
                   "soil_bd",
                   "DTM_10m" ,
                   "slope",
                   "temp_seasonality",
                   "soil_sand",
                   "rain_warmestQuart",
                   "soil_carbon" ,
                   "isothermality" ,
                   "aspect")

#### Run Random Forest with final predictors and assess accuracy -----------------------------
# Split data into training and testing set
set.seed(123)
train <- features %>% sample_frac(0.5)
nrow(train)
test <- features %>% filter(!id %in% train$id)
nrow(test)

# Run RF model
model.rf <- randomForest(data=train, 
                         x = train[,predVarsFinal],
                         y = train$ndvi, 
                         ntree=100,
                         importance=TRUE,
                         do.trace = 20)
# Explore output
model.rf
plot(model.rf)

# Variable importance plot
varImpPlot(model.rf, sort=T)

# Predict against test dataset to see predictive performance
predict.rf<- predict(model.rf, test)
test$prediction<- predict.rf
hist(test$prediction)

# Plot validation plot
makeValidationPlot(test$prediction,test$ndvi,test,0.5,0.9)

#### Export training dataset for upload to GEE-----------------------------

train %>%
  dplyr::select(c(predVarsFinal, 'ndvi', 'id')) %>%
  write_csv('./OUTPUT/For_GEE/training_features_skog.csv')
