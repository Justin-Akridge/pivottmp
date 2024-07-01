import sys
import laspy
import numpy as np
import json
from sklearn.cluster import DBSCAN
from pyproj import Proj, Transformer
from scipy.spatial import KDTree
from sklearn.linear_model import LinearRegression
from sklearn.linear_model import RANSACRegressor
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from pyransac3d import Line
from scipy.spatial import cKDTree
from collections import defaultdict

def local_to_geographic(x, y, zone=16, northern=True):
    utm_proj = Proj(proj='utm', zone=zone, datum='WGS84', units='m', north=northern)
    wgs84_proj = Proj(proj='latlong', datum='WGS84')
    transformer = Transformer.from_proj(utm_proj, wgs84_proj)

    lng, lat = transformer.transform(x, y)
    return {lat, lng}

def extract_pole_locations(las_file_path, pole_classification=8):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    pole_mask = classifications == pole_classification
    pole_points = points[pole_mask]
    x = pole_points.x
    y = pole_points.y
    z = pole_points.z
    height_above_ground_meters = pole_points['HeightAboveGround']

    # Convert height above ground from meters to feet
    height_above_ground_feet = height_above_ground_meters * 3.28084

    # Stack coordinates and converted height
    coords = np.vstack((x, y, z, height_above_ground_feet)).transpose()
    #coords = np.vstack((pole_points.x, pole_points.y, pole_points.z,)).transpose()
    #coords = np.vstack((pole_points.x, pole_points.y, pole_points.z, pole_points['HeightAboveGround'])).transpose()
    return coords

def extract_pole_locations_wo(las_file_path, pole_classification=8):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    pole_mask = classifications == pole_classification
    pole_points = points[pole_mask]
    x = pole_points.x
    y = pole_points.y
    z = pole_points.z


    coords = np.vstack((x, y, z)).transpose()
    return coords

def center_of_pole(pole_groups):
    pole_list = []
    for i, pole_group in enumerate(pole_groups):
        # Generate a unique ID for each pole based on its index
        pole_id = i # You can adjust this based on your data or requirements
        pole_group_array = np.array(pole_group)
        center_x = np.mean(pole_group_array[:, 0])
        center_y = np.mean(pole_group_array[:, 1])
        center_z = np.mean(pole_group_array[:, 2])
        height = np.mean(pole_group_array[:, 3])

        ground_z = center_z - height / 3.281

        pole_list.append({ "id": pole_id, "x": center_x, "y": center_y, "z": ground_z })
    return pole_list

#def center_of_pole(pole_groups):
#    pole_list = []
#    for i, pole_group in enumerate(pole_groups):
#        pole_group_array = np.array(pole_group)
#        center_x = np.mean(pole_group_array[:, 0])
#        center_y = np.mean(pole_group_array[:, 1])
#        center_z = np.mean(pole_group_array[:, 2])
#        pole_list.append({ "x": center_x, "y": center_y, "z": center_z })
#    return pole_list

def poles_to_json(pole_groups):
    poles_list = []
    for i, pole_group in enumerate(pole_groups):
        pole_group_array = np.array(pole_group)
        center_x = np.mean(pole_group_array[:, 0])
        center_y = np.mean(pole_group_array[:, 1])
        center_z = np.mean(pole_group_array[:, 2])
        height = np.mean(pole_group_array[:, 3])

        ground_z = center_z - height / 3.281
        #poles_list.append({"geoPosition": {"x": float(center_x), "y": float(center_y), "z": float(ground_z)}})
        lat, lng = local_to_geographic(center_x, center_y)
        poles_list.append({
            "geoPosition": {
                "x": float(center_x), 
                "y": float(center_y), 
                "z": float(ground_z)
            },
            "mapPosition": {
                "lat": lat,
                "lng": lng
            }
        })

    #return pole_list
    return json.dumps(poles_list, indent=4)

def save_poles_to_json(pole_groups, output_file_path):
    poles_list = []
    for i, pole_group in enumerate(pole_groups):
        # Calculate the center of the pole group
        pole_group_array = np.array(pole_group)
        center_x = np.mean(pole_group_array[:, 0])
        center_y = np.mean(pole_group_array[:, 1])
        center_z = np.mean(pole_group_array[:, 2])
        height = np.mean(pole_group_array[:, 3])

        ground_z = center_z - height / 3.281
        poles_list.append({ "geoPosition": {"x": float(center_x), "y": float(center_y), "z": float(ground_z)}})
    print(poles_list)

    with open(output_file_path, 'w') as json_file:
        json.dump(poles_list, json_file, indent=4)

def group_poles(coords, tolerance=1):
    dbscan = DBSCAN(eps=tolerance, min_samples=10)
    labels = dbscan.fit_predict(coords[:, :2])
    unique_labels = set(labels)
    grouped_poles = []
    for label in unique_labels:
        pole_group_coords = coords[labels == label]
        if len(pole_group_coords) > 20:
            grouped_poles.append(pole_group_coords.tolist())
    return grouped_poles

def find_nearest_pole(wire_coords, pole_list):
    pole_tree = KDTree([(pole['x'], pole['y'], pole['z']) for pole in pole_list])
    wire_pole_connections = []

    # Track unique poles connected by the wire
    connected_poles = set()

    for wire_coord in wire_coords:
        distance, index = pole_tree.query(wire_coord)
        nearest_pole = pole_list[index]
        wire_pole_connections.append(nearest_pole)
        connected_poles.add((nearest_pole['x'], nearest_pole['y'], nearest_pole['z']))

    # Check if the wire is connected to more than one pole
    if len(connected_poles) == 1:
        # If connected to one pole, find the nearest pole to the last wire coordinate
        end_distance, end_index = pole_tree.query(wire_coords[-1])
        end_pole = pole_list[end_index]
        if (end_pole['x'], end_pole['y'], end_pole['z']) not in connected_poles:
            connected_poles.add((end_pole['x'], end_pole['y'], end_pole['z']))
            wire_pole_connections.append(end_pole)

    # Create a result object with all connected poles
    result = [
        wire_coords,
        list(connected_poles)
    ]

    return result

#def find_nearest_pole(wire_coords, pole_list):
#    pole_tree = KDTree([(pole['x'], pole['y'], pole['z']) for pole in pole_list])
#    wire_pole_connections = []
#    for wire_coord in wire_coords:
#        distance, index = pole_tree.query(wire_coord)
#        wire_pole_connections.append(pole_list[index])
#    return wire_pole_connections

def find_centerline(pole_points):
    # Convert points to numpy array for linear regression
    X = np.array([(point[0], point[1]) for point in pole_points])
    Y = np.array([point[2] for point in pole_points])

    # Fit linear regression model
    model = LinearRegression().fit(X, Y)

    # Predict z values for the centerline
    z_pred = model.predict(X)

    # Create the centerline points
    centerline_points = [{'x': x, 'y': y, 'z': z} for (x, y), z in zip(X, z_pred)]

    return centerline_points



def calculate_direction(pole, wire_coord):
    pole_pos = np.array([pole['x'], pole['y']])
    wire_pos = np.array([wire_coord[0], wire_coord[1]])
    direction = wire_pos - pole_pos
    return direction / np.linalg.norm(direction)

def find_nearest_pole(wire_coord, pole_list, tolerance=1.0):
    nearest_pole = None
    min_distance = float('inf')

    for pole in pole_list:
        distance = np.sqrt((pole['x'] - wire_coord[0])**2 + (pole['y'] - wire_coord[1])**2)
        if distance <= tolerance and distance < min_distance:
            min_distance = distance
            nearest_pole = pole

    return nearest_pole

def find_pole_line(wire_coords, pole_list, tolerance=1.0):
    pole_array = np.array([[pole['x'], pole['y']] for pole in pole_list])
    wire_array = np.array([[coord[0], coord[1], coord[2], coord[3]] for coord in wire_coords])

    for i in range(len(pole_list) - 1):
        print(pole_list[i])
        for j in range(i + 1, len(pole_list)):
            print(pole_list[j])
            break

#def find_pole_line(wire_coords, pole_list, tolerance=1.0):
#    pole_array = np.array([[pole['x'], pole['y']] for pole in pole_list])
#    wire_array = np.array([[coord[0], coord[1], coord[2], coord[3]] for coord in wire_coords])
#
#    proximity_to_poles = {}
#    for pole in pole_list:
#        pole_coords = (pole['x'], pole['y'])
#        proximity_to_poles[pole_coords] = []
#
#        for wire in wire_coords:
#            if abs(pole['x'] - wire[0]) <= tolerance and abs(pole['y'] - wire[1]) <= tolerance:
#                proximity_to_poles[pole_coords].append(wire)
#    
#    for key, value in proximity_to_poles.items():
#        print('key', key)
#        for val in value:
#            print(val)
#
#        print()
#        print()
#    return []


#def find_pole_line(wire_coords, pole_list, radius=10.0):
#    pole_lines = []
#
#    # Convert poles and wire coordinates to numpy arrays
#
#    # Create a k-d tree for fast nearest-neighbor lookup
#    pole_tree = cKDTree(pole_array)
#
#    # Create a dictionary to store wires near each pole
#    pole_to_wires = {tuple(pole): [] for pole in pole_array}
#
#    # Group wire coordinates by proximity to poles
#    for wire in wire_array:
#        x, y, _, _ = wire
#        distances, indices = pole_tree.query([x, y], k=len(pole_list), distance_upper_bound=radius)
#        for distance, index in zip(distances, indices):
#            if distance < radius:
#                pole = tuple(pole_array[index])
#                pole_to_wires[pole].append(wire)
#                break
#
#    # Create a dictionary to store paths
#    path_dict = {}
#
#    # Determine direction and find the nearest pole in that direction
#    for pole, wires in pole_to_wires.items():
#        pole_x, pole_y = pole
#        for wire in wires:
#            x, y, _, _ = wire
#
#            # Calculate direction vector
#            direction = np.array([x - pole_x, y - pole_y])
#            direction = direction / np.linalg.norm(direction)  # Normalize the direction
#
#            # Find the nearest pole in that direction
#            best_pole = None
#            best_projection = -np.inf
#
#            for other_pole in pole_array:
#                if tuple(other_pole) == pole:
#                    continue
#
#                other_x, other_y = other_pole
#                to_other_pole = np.array([other_x - pole_x, other_y - pole_y])
#                projection = np.dot(direction, to_other_pole)
#
#                if projection > best_projection:
#                    best_projection = projection
#                    best_pole = other_pole
#
#            if best_pole is not None:
#                first_pole = pole
#                second_pole = tuple(best_pole)
#                if (first_pole, second_pole) not in path_dict:
#                    path_dict[(first_pole, second_pole)] = []
#
#                path_dict[(first_pole, second_pole)].append(wire)
#
#    # Convert paths to the desired format
#    for (first_pole, second_pole), path_coords in path_dict.items():
#        pole_lines.append({
#            'first_pole': {'x': first_pole[0], 'y': first_pole[1]},
#            'second_pole': {'x': second_pole[0], 'y': second_pole[1]},
#            'coordinates': path_coords
#        })
#
#    return pole_lines
#def find_pole_line(wire_coords, pole_list, tolerance=1.0):
#    pole_lines = []
#
#    # Convert poles and wire coordinates to numpy arrays
#    pole_array = np.array([[pole['x'], pole['y']] for pole in pole_list])
#    wire_array = np.array([[coord[0], coord[1]] for coord in wire_coords])
#
#    # Create a k-d tree for fast nearest-neighbor lookup
#    pole_tree = cKDTree(pole_array)
#
#    # Iterate through each wire coordinate and find the closest pole
#    distances, indices = pole_tree.query(wire_array, k=3)
#
#    # Create a dictionary to store paths
#    path_dict = {}
#
#    for i, (first_idx, second_idx) in enumerate(indices):
#        first_pole = tuple(pole_array[first_idx])
#        second_pole = tuple(pole_array[second_idx])
#
#        if (first_pole, second_pole) not in path_dict:
#            path_dict[(first_pole, second_pole)] = []
#
#        path_dict[(first_pole, second_pole)].append(wire_coords[i])
#
#    # Filter out paths without any wire coordinates between poles
#    for (first_pole, second_pole), path_coords in path_dict.items():
#        filtered_path_coords = [coord for coord in path_coords if is_point_near_line(coord, first_pole, second_pole, tolerance)]
#        if filtered_path_coords:
#            pole_lines.append({
#                'first_pole': {'x': first_pole[0], 'y': first_pole[1]},
#                'second_pole': {'x': second_pole[0], 'y': second_pole[1]},
#                'coordinates': filtered_path_coords
#            })
#
#    return pole_lines
#def find_pole_line(wire_coords, pole_list):
#    pole_lines = []
#
#    # Convert poles and wire coordinates to numpy arrays
#    pole_array = np.array([[pole['x'], pole['y']] for pole in pole_list])
#    wire_array = np.array([[coord[0], coord[1]] for coord in wire_coords])
#
#    # Create a k-d tree for fast nearest-neighbor lookup
#    pole_tree = cKDTree(pole_array)
#
#    # Iterate through each wire coordinate and find the closest pole
#    distances, indices = pole_tree.query(wire_array, k=2)
#
#    # Create a dictionary to store paths
#    path_dict = {}
#
#    for i, (first_idx, second_idx) in enumerate(indices):
#        first_pole = tuple(pole_array[first_idx])
#        second_pole = tuple(pole_array[second_idx])
#
#        if (first_pole, second_pole) not in path_dict:
#            path_dict[(first_pole, second_pole)] = []
#
#        path_dict[(first_pole, second_pole)].append(wire_coords[i])
#
#    # Convert paths to the desired format
#    for (first_pole, second_pole), path_coords in path_dict.items():
#        pole_lines.append({
#            'first_pole': {'x': first_pole[0], 'y': first_pole[1]},
#            'second_pole': {'x': second_pole[0], 'y': second_pole[1]},
#            'coordinates': path_coords
#        })
#
#    return pole_lines

#def find_pole_line(wire_coords, pole_list):
#    sorted_pole_list = sorted(pole_list, key=lambda pole: (pole['x'], pole['y']))
#    pole_lines = []
#
#    # Iterate through pairs of consecutive poles
#    for i in range(len(sorted_pole_list) - 1):
#        first_pole = sorted_pole_list[i]
#        for j in range(i + 1, len(sorted_pole_list)):
#            second_pole = sorted_pole_list[j]
#
#            # Filter wire_coords between current pair of poles
#            path_coords = []
#
#            for coord in wire_coords:
#                x, y, _, _ = coord
#
#                if ((first_pole['x'] <= x <= second_pole['x'] or
#                 second_pole['x'] <= x <= first_pole['x']) and
#                (first_pole['y'] <= y <= second_pole['y'] or
#                 second_pole['y'] <= y <= first_pole['y'])):
#
#                    path_coords.append(coord)
#
#            # Append the path information to pole_lines
#            pole_lines.append({
#                'first_pole': first_pole,
#                'second_pole': second_pole,
#                'coordinates': path_coords
#            })
#
#    return pole_lines
    
def fit_ransac_to_pole(pole_points):
    X = np.array(pole_points)[:, :2]  # Take only x and y
    y = np.array(pole_points)[:, 2]   # Take z as the target

    # Ensure X is a 2D array
    if X.ndim == 1:
        X = X.reshape(-1, 1)

    ransac = RANSACRegressor(estimator=LinearRegression())
    ransac.fit(X, y)

    inlier_mask = ransac.inlier_mask_
    outlier_mask = np.logical_not(inlier_mask)

    return {
        'model': ransac.estimator_,
        'inliers': X[inlier_mask].tolist(),
        'outliers': X[outlier_mask].tolist(),
        'predicted_z': ransac.predict(X).tolist()
    }

def ransac_linefit_sklearn(points):
    points = np.array(points)
    if points.ndim != 2 or points.shape[1] < 4:
        raise ValueError("Expected 2D array with at least four columns (x, y, z, height above ground).")
    
    X = points[:, :2]  # Take only x and y
    y = points[:, 2]   # Take z as the dependent variable
    
    data = np.column_stack((X, y))
    model = LineModelND()
    model_robust, inliers = ransac(data, model_class=LineModelND, min_samples=35, residual_threshold=500, max_trials=5000)
    return model_robust, inliers

     # Iterate over each pole and wire points

def Ransac3d(pole_groups, start_points):
    segment_results = []
    for pole_group, start_point in zip(pole_groups, start_points):
        start_point_xyz = (start_point['x'], start_point['y'], start_point['z'])
        start_point_np = np.array(start_point_xyz)

        pole = np.array(pole_group)

        pole -= start_point_np

        line_estimator = Line()
        try:
            A, B, inliers = line_estimator.fit(pole, thresh=0.1, maxIteration=6000)

            inlier_points = pole[inliers]
            start_point = inlier_points.min(axis=0)
            end_point = inlier_points.max(axis=0)
            # Adjust back to global coordinates if needed
            B += start_point_np

            # Adjust back to global coordinates if needed
            start_point += start_point_np
            end_point += start_point_np

            segment_info = {
                'direction_vector': A.tolist(),  # Convert to list for JSON serialization
                'point_on_line': B.tolist(),     # Convert to list for JSON serialization
                'start_point': start_point_xyz,  # Keep as tuple for JSON serialization
                'end_point': end_point.tolist(),
                'inliers_indices': inliers.tolist()  # Convert to list for JSON serialization
            }
            segment_results.append(segment_info)
        except ValueError as e:
            print(f"Error fitting line to data: {e}")
            continue

    return segment_results

#def Ransac3d(pole_groups, start_points):
#    segment_results = []
#    for pole_group, start_point in zip(pole_groups, start_points):
#        start_point_xyz = (start_point['x'], start_point['y'], start_point['z'])
#        print(start_point_xyz)
#        start_point_np = np.array(start_point_xyz)
#
#        # Convert to numpy arrays if necessary
#        pole = np.array(pole_group)
#
#        # Ensure the data is 3-dimensional
#        if pole.shape[1] != 3 or start_point_np.shape[0] != 3:
#            raise ValueError("Input data must be 3-dimensional")
#
#        # Adjust the starting point
#        pole -= start_point_np
#
#        line_estimator = Line()
#        try:
#            A, B, inliers = line_estimator.fit(pole, thresh=0.2, maxIteration=10000)
#
#            inlier_points = pole[inliers]
#            start_point = inlier_points.min(axis=0)
#            end_point = inlier_points.max(axis=0)
#            # Adjust back to global coordinates if needed
#            B += start_point_np
#            segment_info = {
#                'direction_vector': A.tolist(),  # Convert to list for JSON serialization
#                'point_on_line': B.tolist(),     # Convert to list for JSON serialization
#                'start_point': start_point_xyz,  # Keep as tuple for JSON serialization
#                'end_point': end_point.tolist(),
#                'inliers_indices': inliers.tolist()  # Convert to list for JSON serialization
#            }
#            segment_results.append(segment_info)
#        except ValueError as e:
#            print(f"Error fitting line to data: {e}")
#            continue
#
#    return segment_results

def segments_to_json(segment_results, output_file_path):
    with open(output_file_path, 'w') as json_file:
        json.dump(segment_results, json_file, indent=4)

def plot_line_and_points_3d(points, direction_vector, point_on_line, inliers):
    fig = plt.figure(figsize=(10, 8))
    ax = fig.add_subplot(111, projection='3d')

    # Scatter plot of all points
    ax.scatter(points[:, 0], points[:, 1], points[:, 2], c='b', label='Points')

    # Scatter plot of inliers
    inlier_points = points[inliers]
    ax.scatter(inlier_points[:, 0], inlier_points[:, 1], inlier_points[:, 2], c='g', marker='o', label='Inliers')

    # Generate line points for plotting
    t_values = np.linspace(-50, 50, num=100)
    line_fit = point_on_line + np.outer(t_values, direction_vector)

    # Plot the fitted line
    ax.plot(line_fit[:, 0], line_fit[:, 1], line_fit[:, 2], c='r', label='Fitted Line')

    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.set_zlabel('Z')
    ax.set_title('RANSAC Fitted Line and Points')
    ax.legend()

    plt.show()

def plot_line_and_points(points, model, inliers):
    fig, ax = plt.subplots()

    # Plot all points
    ax.scatter(points[:, 0], points[:, 1], c='b', label='All Points')

    # Plot inliers
    ax.scatter(points[inliers, 0], points[inliers, 1], c='g', label='Inliers')

    # Plot the RANSAC line
    if model is not None:
        x = np.linspace(np.min(points[:, 0]), np.max(points[:, 0]), 100)
        y = model.predict_y(x)
        ax.plot(x, y, '-r', label='RANSAC Line')

    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    ax.legend()
    plt.show()


if __name__ == "__main__":
    #las_file = './18.las'
    #pole_locations = extract_pole_locations(las_file)

    #uncomment for server
    las_data_stream = sys.stdin.buffer.read()
    pole_locations = extract_pole_locations(las_data_stream)
    grouped_poles = group_poles(pole_locations)
    json_output = poles_to_json(grouped_poles)
    print(json_output)

    #pole_list = center_of_pole(grouped_poles)

    ##wire_pole_connections = find_nearest_pole(wire_coords, pole_list)
    #wire_coords = extract_wire_locations(las_file)
    #sorted_wire_coords = sorted(wire_coords, key=lambda coord: (coord[0], coord[1]))

    #pole_lines = find_pole_line(sorted_wire_coords, pole_list)
    #
    #paths = []
    #for line in pole_lines:
    #    paths.append([line['first_pole'], line['second_pole']])

    #with open('paths.json', 'w') as path_file:
    #        json.dump(paths, path_file, indent=4)
            #wires = path['coordinates']
            #for i, wire in enumerate(wires):
            #    if i == 20:
            #        break
            #    print(wire)

    #pole_locations_with_height = extract_pole_locations_wo(las_file)
    #grouped_poles2 = group_poles(pole_locations_with_height)
    #res = Ransac3d(grouped_poles2, pole_list)
    ##res = Ransac3d(grouped_poles)
    #segments_to_json(res, 'output_segments.json')


    #for i, group in enumerate(grouped_poles):
    #    print(group)
    #    points = np.array(group)
    #    ransac_result, inliers = ransac_linefit_sklearn(group)
    #    print(f"Pole {i}: RANSAC result - {ransac_result.params}")
    #    print(f"Pole {i}: Inliers - {inliers}")
    #    
    #    # Plot the points and the RANSAC line
    #    # plot_line_and_points_3d(points, ransac_result, inliers)
    #    plot_line_and_points(points[:, :2], ransac_result, inliers)





