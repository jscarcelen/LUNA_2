## Central tendency - mean, median

# Central tendency - mean, median

Median is less sensitive to outliers than the mean ( . Median nicer to report when extreme outliers. If median and mean are very different, it is because of outliers. \bar{x}) x )

The p th quantile is the number such that p% of observations are below, (1-p)% above

## Sample spread - variance, standard deviation

# Sample spread - variance, standard deviation

The average of the difference from each variable observation to the mean is always 0. The size of individual differences between variable and mean tells how much spread the sample is.

Sample variance measures spread, is the average squared distance of the mean: S_(x)^(2) S x 2

- Note we square to ensure the number will be positive. The larger the value, the more spread. S_(x)^(2) = (1)/(n-1) \bar{x} S x 2 = 1 n-1 i=1 n x i - x 2

- If is large, dividing by or does not change much. x_(i) - \bar{x} x i - x

- Lowest is 0 (all numbers coincide with the mean). n n (1)/(n) 1 n (1)/(n-1) 1 n-1

Units are in units of x squared, solved by taking the square root of the sample variance, and get the sample standard deviation : S_(x)^(2) S x 2

The standard deviation is a measure of the sample spread measured in units of . S_(x) S x

## Empirical rule S_(x) = S_(x)^(2) = \bar{x} S x = S x 2 = 1 n-1 i=1 n x i - x 2

# Empirical rule S_(x) = S_(x)^(2) = \bar{x} S x = S x 2 = 1 n-1 i=1 n x i - x 2

The empirical rule will help us understand and relate the summaries back to the histogram. x x

For Mound-shape data (bell shape, tails on both sides), the empirical rule claims that

- 68% of data is within S_(x) S x

- 95% of data within

\bar{x} = \bar{x} ± S_(x) x - S x , x + S x = x ± S x

Comparing mutual funds – comparing mean vs standard deviation: Select those with higher mean returns and lowest standard deviation (variability). Can be seen from scatterplot. \bar{x} = \bar{x} ± 2S_(x) x - 2S x , x + 2S x = x ± 2S x

## Variable association – Conditional statistics

# Variable association – Conditional statistics

Relation between categorical variables to unlock relations. For instance, pivot table and fraction of observations in each bucket (% of total, % of pivot row, % of pivot column).

Conditioning relates to a forecasting question where you are given a piece of information. If I condition on whether people watch the Simpsons, I am asking “if I tell you whether a person watches the Simpsons, how does that affect your view on whether that person drinks soda. If I condition on Soda, I am asking “if I tell you whether a person drinks Soda or not, how does that affect your view on whether that person watches the Simpsons.

## Covariance and correlation – scatterplots &amp; linear relation

# Covariance and correlation – scatterplots &amp; linear relation

Covariance and correlation summarize how strong a linear relationship is between two variables.

Sample covariance between x and y is:

Sample covariance units are units of x times units of y. Hence, we use sample correlation (unit-free measure), which is the sample covariance over the product of standard deviations of x and y:

Sample correlation lies between -1 and 1 (), giving both linear relation strength and direction . The closer to 1, the stronger linear correlation (positive, or negative slope). Correlation does not give us the measure of the slope, just the linear relationship strength. S_(xy) S xy

Samples can have perfect non-linear relationships, and give correlation of 0, since correlation only measures linear relationship. Low correlation might mean either low association between the data, or follow a non-linear relation (e.g., parabolic, logarithmic, etc.). S_(xy) = (1)/(n-1) \bar{x} S xy = 1 n-1 i=1 n x i - x y i - y

If a sample follows a parabolic curve relationship, correlation between x and y would be 0, but correlation between x 2 and y 2 would be 1. r_(xy) r xy

Building a correlation matrix (symmetric matrix) is helpful to compare many variables. r_(xy) = (S xy)/(S x · S y) r xy = S xy S x · S y

Focus on the sign of the covariance / correlation, it tells us which quadrant of the scatterplot we should expect to see our data respect to the mean. Positive covariance means that when one variable is above its mean, the other should be too. If negative, when one variable is above the mean, the other should be below. -1≤ r_(xy) &lt;1 -1≤ r xy &lt;1

Correlation has always same sign as covariance, as we are dividing by two positive numbers (standard deviation).

## Natural logarithms – transforming positive, right-skewed data

# Natural logarithms – transforming positive, right-skewed data

It is common to transform right-skewed data to look mound-shaped/bell-shaped (where empirical rule is applicable).

The natural logarithm is the inverse of the exponential function :

Properties:

Logs are only defined for positive numbers.

We can log-transform distributions so that they passed from skewed to mount-shaped, apply the empirical rule, and we can come back to the original data by taking the exponent. Same for the empirical rule boundaries, can be taken the exponent to relate to the original data and make it more interpretable.