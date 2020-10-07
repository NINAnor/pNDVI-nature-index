
#### Introduction -----------------------------------------------------------------------
# This script imports packages, defines global variables and functions

#### Import libraries -----------------------------------------------------------------------
library(tidyverse)
library(randomForest)
library(caret)
library(sf)
library(rnaturalearth)
library(raster)
library(corrplot)
library(RColorBrewer)

#### Plotting theme and palettes maybe needed for plots -------------------------------------------
theme_set(theme_bw()+ 
            theme(panel.grid.major = element_blank(), panel.grid.minor = element_blank())+
            theme(strip.background =element_rect(fill="white")))

world_shp <- ne_countries(scale = "medium", returnclass = "sf")

pal <- c('#000004', '#2C105C', '#711F81', '#B63679', '#EE605E', '#FDAE78', '#FCFDBF')
palCurl <- c('#151d44', '#156c72', '#7eb390', '#fdf5f4', '#db8d77', '#9c3060', '#340d35')
palOxy <- c('#400505', '#850a0b', '#6f6f6e', '#9b9a9a', '#cbcac9', '#ebf34b', '#ddaf19')
palOxy2 <- c('#400505', '#9b9a9a', '#ddaf19')
palHawai <- c('#8C0273','#922A59','#964742','#996330','#9D831E','#97A92A','#80C55F','#66D89C','#6CEBDB','#B3F2FD')
palTofinio <- c('#DED9FF','#93A4DE','#4A6BAC','#273C65','#121926','#122214','#244D28','#3F8144','#88B970','#DBE69B')
palNuuk <- c('#05598C','#296284','#4A7283','#6F878D','#929C96','#ABAD96','#BAB98D','#C7C684','#E0E08E','#FEFEB2')
myPal <- c('#ff5c40', '#ffba26', '#7f8280', '#026ccf', '#0fffff')
megatron <- c('#C6FFDD','#FBD786', '#f7797d')
kingyna <- c('#1a2a6c', '#b21f1f', '#fdbb2d')


#### Global functions ---------------------------------------------------------------------------
readMultiFiles <- function(directory){
  
  files <- list.files(directory, pattern='*.csv', full.names=TRUE)
  raw <- files %>% 
    map_df(~read_csv(.))
  return (raw)
  
}

makeValidationPlot <- function(x,y,df,xMin,yMax){
  arg <- match.call()
  
  d = eval(arg$x)-eval(arg$y)
  mse = mean((d)^2)
  mae = mean(abs(d))
  rmse = sqrt(mse)
  R2 = 1-(sum((d)^2)/sum((eval(arg$x)-mean(eval(arg$x)))^2))
  
  
  eq1 <- substitute(italic(R)^2~"="~r2, 
                    list(r2 = format(R2, digits = 3)))
  eq2 <- substitute(italic(RMSE)~"="~rmse, 
                    list(rmse =  format(rmse, digits = 3)))
  eq3 <- substitute(italic(MAE)~"="~mae, 
                    list(mae =  format(mae, digits = 3)))
  print(eq2)
  lm_eqn <- as.character(as.expression(eq1))
  lm_eqn2 <- as.character(as.expression(eq2))
  lm_eqn3 <- as.character(as.expression(eq3))
  textDF <- data.frame(xMin=xMin, yMax=yMax,lm_eqn=lm_eqn)
  textDF2 <- data.frame(xMin=xMin, yMax=yMax-0.05,lm_eqn=lm_eqn2)
  textDF3 <- data.frame(xMin=xMin, yMax=yMax-0.1,lm_eqn=lm_eqn3)
  plot <- ggplot(data = df, aes(x = eval(arg$x), y = eval(arg$y)))  +
    geom_point(alpha =0.1) +
    geom_smooth(method = "lm", se=FALSE, color="red", formula = y ~ x)+ 
    geom_text(data = textDF, inherit.aes=FALSE, aes(x = xMin, y = yMax, label = lm_eqn), parse = TRUE) + 
    geom_text(data = textDF2, inherit.aes=FALSE, aes(x = xMin, y = yMax, label = lm_eqn), parse = TRUE) + 
    geom_text(data = textDF3, inherit.aes=FALSE, aes(x = xMin, y = yMax, label = lm_eqn), parse = TRUE) + 
    xlab("Predicted NDVI") + 
    ylab("Observed") + 
    ylim(0.4, 0.9) + xlim(0.4, 0.9)+ 
    geom_abline(intercept = 0, slope = 1, linetype=2)
  return (plot)
}
