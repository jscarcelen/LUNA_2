# Central tendency - mean, median

Median is less sensitive to outliers than the mean ( $\\\bar{x})$. Median nicer to report when extreme outliers. If median and mean are very different, it is because of outliers.

The pth quantile is the number such that p% of observations are below, (1-p)% above

# Sample spread - variance, standard deviation

The average of the difference from each variable observation to the mean is always 0. The size of individual differences between variable and mean tells how much spread the sample is.

Sample variance $S_x^2$ measures spread, is the average squared distance of the mean:

$$
S_x^2 = \frac{1}{n-1} \\\bar{x}
$$

- Note we square $x_i - \\\bar{x}$ to ensure the number will be positive. The larger the value, the more spread.

- If $n$ is large, dividing by $\frac{1}{n}$ or $\frac{1}{n-1}$ does not change much.

- Lowest $S_x^2$ is 0 (all numbers coincide with the mean).

Units are in units of x squared, solved by taking the square root of the sample variance, and get the sample standard deviation $S_x$:

$$
S_x = S_x^2 = \\\bar{x}
$$

The standard deviation is a measure of the sample spread measured in units of $x$.

# Empirical rule

The empirical rule will help us understand $S_x$ and relate the summaries back to the histogram.

For Mound-shape data (bell shape, tails on both sides), the empirical rule claims that

- 68% of data is within  $\\\bar{x} = \\\bar{x} \pm S_x$

- 95% of data within  $\\\bar{x} = \\\bar{x} \pm 2S_x$

Comparing mutual funds – comparing mean vs standard deviation: Select those with higher mean returns and lowest standard deviation (variability). Can be seen from scatterplot.

# Variable association – Conditional statistics

Relation between categorical variables to unlock relations. For instance, pivot table and fraction of observations in each bucket (% of total, % of pivot row, % of pivot column).

Conditioning relates to a forecasting question where you are given a piece of information. If I condition on whether people watch the Simpsons, I am asking “if I tell you whether a person watches the Simpsons, how does that affect your view on whether that person drinks soda. If I condition on Soda, I am asking “if I tell you whether a person drinks Soda or not, how does that affect your view on whether that person watches the Simpsons.

# Covariance and correlation – scatterplots & linear relation

Covariance and correlation summarize how strong a linear relationship is between two variables.

Sample covariance $S_xy$ between x and y is:

$$
S_xy = \frac{1}{n-1} \\\bar{x}
$$

Sample covariance $r_xy$ units are units of x times units of y. Hence, we use sample correlation (unit-free measure), which is the sample covariance over the product of standard deviations of x and y:

$$
r_xy = \frac{S xy}{S x · S y}
$$

Sample correlation lies between -1 and 1 ($-1≤ r_xy <1$), giving both linear relation strength and direction. The closer to 1, the stronger linear correlation (positive, or negative slope). Correlation does not give us the measure of the slope, just the linear relationship strength.

Samples can have perfect non-linear relationships, and give correlation of 0, since correlation only measures linear relationship. Low correlation might mean either low association between the data, or follow a non-linear relation (e.g., parabolic, logarithmic, etc.).

If a sample follows a parabolic curve relationship, correlation between x and y would be 0, but correlation between x2 and y2 would be 1.

Building a correlation matrix (symmetric matrix) is helpful to compare many variables.

Focus on the sign of the covariance / correlation, it tells us which quadrant of the scatterplot we should expect to see our data respect to the mean. Positive covariance means that when one variable is above its mean, the other should be too. If negative, when one variable is above the mean, the other should be below.

Correlation has always same sign as covariance, as we are dividing by two positive numbers (standard deviation).

# Natural logarithms – transforming positive, right-skewed data

It is common to transform right-skewed data to look mound-shaped/bell-shaped (where empirical rule is applicable).

The natural logarithm is the inverse of the exponential function $e$: $e^2 =7.389→ ln 7.389 =2$

Properties:

$$
e^ab = e^a e^b → ln ab = ln a + ln b
$$

$$
a^b =b· ln⁡ (a)
$$

Logs are only defined for positive numbers.

We can log-transform distributions so that they passed from skewed to mount-shaped, apply the empirical rule, and we can come back to the original data by taking the exponent. Same for the empirical rule boundaries, can be taken the exponent to relate to the original data and make it more interpretable.