import numpy as np
from sklearn import cluster
import matplotlib.pyplot as plt
import matplotlib.colors as colors
import laspy

# Load the .las file
las = laspy.read("input.las")

# Extract the x, y, z coordinates
points = np.vstack((las.x, las.y, las.z)).transpose()


fig = plt.figure()
ax = fig.add_subplot(projection = "3d", title = "Sample Points")
ax.scatter(points[:,0], points[:,1], points[:,2], marker = "o");

processed_points = points - points.min(axis = 0)
processed_points /= processed_points.max(axis = 0)

model = cluster.DBSCAN(eps = 0.15)
model.fit(processed_points)
labels = sorted(set(model.labels_))
print(f"Labels: {labels}")

cmap = plt.cm.get_cmap("viridis")
bounds = np.linspace(labels[0] - 0.5, labels[-1] + 0.5, len(labels) + 1)
norm = colors.BoundaryNorm(bounds, cmap.N)

fig = plt.figure()
ax = fig.add_subplot(projection = "3d", title = "Clustered Points")
scatter = ax.scatter(points[:,0], points[:,1], points[:,2],
                     s = 5,
                     c = model.labels_,
                     norm = norm,
                     cmap = cmap)

fig.colorbar(scatter, ticks = labels);


