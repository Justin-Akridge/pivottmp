import sys
import laspy
from collections import defaultdict
import json
import numpy as np
from math import sqrt
import math
from sklearn.cluster import DBSCAN
from scipy.spatial import KDTree
from scipy.spatial.distance import cdist
from pyransac3d import Line
from mpl_toolkits.mplot3d import Axes3D
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt

#EXTRACT POLE LOCATIONS
def extract_pole_locations(las_file_path, pole_classification=8):
    las = laspy.read(las_file_path)

    points = las.points
    classifications = points.classification

    pole_mask = classifications == pole_classification
    pole_points = points[pole_mask]

    coords = np.vstack((pole_points.x, pole_points.y, pole_points.z, pole_points['HeightAboveGround'])).transpose()
    return coords

def filter_poles_by_point_count(grouped_poles, min_points=100):
    filtered_poles = [group for group in grouped_poles if len(group) >= min_points]
    return filtered_poles

def group_poles(coords, tolerance=1):
    dbscan = DBSCAN(eps=tolerance, min_samples=100)
    labels = dbscan.fit_predict(coords[:, :2])

    unique_labels = set(labels)

    grouped_poles = []
    for label in unique_labels:
        pole_group_coords = coords[labels == label]
        if len(pole_group_coords) > 100:
            grouped_poles.append(pole_group_coords.tolist())


    return grouped_poles


def distance_from_first_pole(wire_points, first_pole):
    return euclidean_distance(wire_points, first_pole[:2])

def euclidean_distance(point1, point2):
    return sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def trace_wire_path_with_kdtree(start_point, points, max_distance):
    """
    Trace the path of a wire starting from `start_point` within `max_distance` using KD-Tree for nearest neighbor search.

    Parameters:
    - start_point (dict): Starting point coordinates {'x': float, 'y': float, 'z': float}.
    - points (list): List of all points [{'x': float, 'y': float, 'z': float}, ...].
    - max_distance (float): Maximum distance threshold to consider points as connected.

    Returns:
    - list: List of points that belong to the traced wire path.
    """
    wire_path = []
    remaining_points = set((point[0], point[1], point[2]) for point in points)

    current_point = start_point
    kdtree_points = np.array([(point[0], point[1], point[2]) for point in points])
    kdtree = KDTree(kdtree_points)

    while remaining_points:
        # Query KD-Tree for nearest neighbors within max_distance
        _, idx = kdtree.query(np.array((current_point[0], current_point[1], current_point[2])), k=1, distance_upper_bound=max_distance)

        if np.isinf(_):
            break

        nearest_point = points[0]

        if nearest_point in remaining_points:
            wire_path.append(nearest_point)
            current_point = nearest_point
            remaining_points.remove(nearest_point)
        else:
            break

    return wire_path

# Adjusted find_wires function using KD-Tree for optimization
def find_wires_optimized(wire_locations, max_distance=1.0):
    wires = {}

    for pole, points in wire_locations.items():
        wire_points = []

        for point in points:
            if point not in wire_points:
                wire_path = trace_wire_path_with_kdtree(point, points, max_distance)
                wire_points.extend(wire_path)

        wires[pole] = wire_points

    return wires

def extract_wire_locations(las_file_path, wire_classification=7, min_height=6.0, max_height=50.0):
    las = laspy.read(las_file_path)

    points = las.points
    classifications = points.classification

    # Filter points based on wire classification
    wire_mask = classifications == wire_classification
    wire_points = points[wire_mask]

    # Filter points based on height above ground
    height_mask = (wire_points['HeightAboveGround'] >= min_height) & (wire_points['HeightAboveGround'] <= max_height)
    filtered_wire_points = wire_points[height_mask]

    # Extract coordinates
    coords = np.vstack((filtered_wire_points.x, filtered_wire_points.y, filtered_wire_points.z, filtered_wire_points['HeightAboveGround'])).transpose()

    return coords


def find_wire_locations_by_x(paths, wire_locations, tolerance = 2):
    wire_map = {}
    for path in paths:
        if len(path) != 2:
            continue
        pole1 = path[0]['geoPosition']
        pole2 = path[1]['geoPosition']
        if len(pole1) != 3 or len(pole2) != 3:
            continue

        x1, y1, z1 = pole1['x'], pole1['y'], pole1['z']
        x2, y2, z2 = pole2['x'], pole2['y'], pole2['z']
        key = ((x1, y1, z1), (x2, y2, z2))


        wire_map[key] = []

        direction_vector = np.array([x2 - x1, y2 - y1, z2 - z1])
        length = np.linalg.norm(direction_vector) * 3.28084

        if length == 0:
            continue


        # Loop through wire locations and check proximity to the line segment
        for wx, wy, wz, height in wire_locations:
            if wx >= min(x1, x2) - 3 and wx <= max(x1, x2) + 3 and wy >= min(y1,y2) - 3 and wy <= max(y1,y2) + 3:
                # removing height for now
                wire_map[key].append([wx, wy, wz, height])

                # wire_map[key].sort(key=lambda point: distance_from_first_pole(point, (x1, y1, z1)))

        #wire_map[key].sort(key=lambda point: distance_from_first_pole(point, (x1, y1, z1)[:2]))  # Sort by x and y only

        wire_map[key].sort(key=lambda point: point[3])

        # wire_map[key].sort(key=lambda point: distance_from_first_pole(point, (x1, y1, z1)))
        # wire_map[key].sort(key=lambda point: point[1])

    return wire_map
# Example usage with optimized function

def seperate_poles(paths):
    poles = []
    for path in paths:
        pole1 = path[0]['geoPosition']
        pole2 = path[1]['geoPosition']
        x1, y1, z1 = pole1['x'], pole1['y'], pole1['z']
        x2, y2, z2 = pole2['x'], pole2['y'], pole2['z']

        if [x1, y1, z1] not in poles:
            poles.append([x1, y1, z1])

        if [x2, y2, z2] not in poles:
            poles.append([x2, y2, z2])
    return poles

def find_chosen_pole_groups(poles, grouped_poles):

    # each index corresponds to the pole in the pole array
    chosen_groups = []

    for pole in poles:
        for group in grouped_poles:
            x_coords = [point[0] for point in group]
            y_coords = [point[1] for point in group]
            z_coords = [point[2] for point in group]

            min_x = min(x_coords)
            max_x = max(x_coords)
            min_y = min(y_coords)
            max_y = max(y_coords)

            if (pole[0] >= min_x and pole[0] <= max_x and pole[1] >= min_y and pole[1] <= max_y):
                chosen_groups.append(group)
                break



    ## TODO[]: implement the glc
    #for group in chosen_groups:

    #    coords = {}
    #    groups = []

    #    for point in group:
    #        x = point[0]
    #        y = point[1]
    #        z = point[2]
    #        placed = False
    #        for sub_group in groups:
    #            if abs(sub_group[0][2] - z) <= 0.2:
    #                sub_group.append(point)
    #                placed = True
    #                break
    #        if not placed:
    #            groups.append([point])  # Append a new list containing the point

            #print(sub_group)
    #    mx_glc = 0
    #    for sub_group in groups:
    #        coords = defaultdict(lambda: {'x': [], 'y': []})

    #        for point in sub_group:
    #            x = point[0]
    #            y = point[1]
    #            z = point[2]

    #            coords[z]['x'].append(x)
    #            coords[z]['y'].append(y)

    #        # Calculate GLC for each z group
    #        for z, coord in coords.items():
    #            print(f"key {z}")
    #            print(coord)
    #            x_min = min(coord['x'])
    #            x_max = max(coord['x'])
    #            y_min = min(coord['y'])
    #            y_max = max(coord['y'])

    #            glc_x = ((abs(x_max - x_min) * 3.14) * 3.28084) * 12  # Convert to feet assuming 3.14 is used for pi
    #            glc_y = ((abs(y_max - y_min) * 3.14) * 3.28084) * 12 # Convert to feet assuming 3.14 is used for pih
    #            print()
    #            print(glc_x)
    #            print(glc_y)
    #            print()

    #            glc = max(glc_x, glc_y)
    #            mx_glc = max(glc, mx_glc)

    #    print(f"Maximum GLC for group: {mx_glc} feet")
    
    return chosen_groups
    #for group in chosen_groups:
    #    coords = {}
    #    groups = []

    #    for point in group:
    #        x = point[0]
    #        y = point[1]
    #        z = point[2]
    #        placed = False
    #        for group in groups:
    #            if abs(group[0][2] - z) <= 0.2:
    #                group.append(point)
    #                placed = True
    #                break
    #        if not placed:
    #            groups.append(point)

    #        #if z in coords:
    #        #    coords[z]['x'].append(x)
    #        #    coords[z]['y'].append(y)
    #        #else:
    #        #    coords[z] = {'x': [x], 'y': [y]}

    #    mx_glc = 0
    #    for key, coord in coords.items():
    #        print(key)
    #        print(coord)
    #    for z, coords in coords.items():
    #        x_min = min(coords['x'])
    #        x_max = max(coords['x'])
    #        y_min = min(coords['y'])
    #        y_max = max(coords['y'])

    #        glc_x = (abs(x_max-x_min) * 3.14) * 3.28084
    #        glc_y = (abs(y_max-y_min) * 3.14) * 3.28084

    #        glc = max(glc_x, glc_y)
    #        mx_glc = max(glc, mx_glc)
    #    print(mx_glc)



    #group_ground_radius = []
    #

    #for pole in poles:
    #
    #for key, group in group_poles:

    #    group_ground_radius[key] = {
    #        "p1": p1,
    #        "p2": p2,
    #        "p3": p3,
    #        "p4": p4
    #    }

def find_pole_edges(groups):
    min_max = []
    for group in groups:
        if group:
            x_coords = [point[0] for point in group]
            y_coords = [point[1] for point in group]

            x_min = min(x_coords)
            x_max = max(x_coords)
            y_min = min(y_coords)
            y_max = max(y_coords)
            min_max.append({
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max
            })
    return min_max

def exclude_poles_from_wires(pole_edges, wire_locations):
    true_wires = {}

    pole_idx = 0

    for pole, wires in wire_locations.items():

        pole1 = pole_edges[pole_idx]
        pole2 = pole_edges[pole_idx + 1]
        included_points = []
        excluded_points = []
        x_min1, x_max1, y_min1, y_max1 = pole1['x_min'], pole1['x_max'], pole1['y_min'], pole1['y_max']
        x_min2, x_max2, y_min2, y_max2 = pole2['x_min'], pole2['x_max'], pole2['y_min'], pole2['y_max']
        for wire in wires:
            x = wire[0]
            y = wire[1]

            # I adjusted this// remove the -1 + 1 for tolerance
            if (x_min1 - 1 <= x <= x_max1 + 1 and y_min1 - 1 <= y <= y_max1 + 1) or (x_min2 - 1 <= x <= x_max2 + 1 and y_min2 - 1 <= y <= y_max2 + 1):
                included_points.append(wire)
            else:
                excluded_points.append(wire)

        true_wires[pole] = excluded_points


        pole_idx += 1
    return true_wires

def write_midspan_to_json(midspans):
    out_file = open("midspans.json", "w")
    json.dump(midspans, out_file, indent = 4)
    out_file.close()

def extract_geo_positions(markers):
    geo_positions = []
    for marker in markers:
        if "geoPosition" in marker:
            geo_positions.append((
                marker["geoPosition"]["x"],
                marker["geoPosition"]["y"],
                marker["geoPosition"]["z"]
            ))
    return geo_positions

def group_wires(wires, tolerance):
    groups = []
    for wire in wires:
        grouped = False
        for group in groups:
            # Check if the wire can be grouped into the existing group
            if all(abs(wire[i] - group[0][i]) <= tolerance for i in range(3)):
                group.append(wire)
                grouped = True
                break
        if not grouped:
            groups.append([wire])
    return groups

def find_wires_above_lowest_midspan(wire_locations, tolerance=1.00):
    midspans = []
    for key, wires in wire_locations.items():
        curr = wires[0]
        low = 100
        for wire in wires:
            if wire[3] < low:
                low = wire[3]
                curr = wire
        midspans.append(curr)
        #lowest_x = lowest_wire[0]
        #lowest_y = lowest_wire[1]
        #lowest_z = lowest_wire[2]
        #above_wires = [wire for wire in wires if 
        #               abs(wire[0] - lowest_x) <= tolerance and 
        #               abs(wire[1] - lowest_y) <= tolerance and 
        #               wire[2] > lowest_z]
        #wire_groups = group_wires(above_wires, tolerance)
    print(midspans)
    return midspans

#def calculate_distance(pole1, pole2):
#    """Calculate the Euclidean distance between two poles."""
#    return math.sqrt((pole2[0] - pole1[0])**2 + (pole2[1] - pole1[1])**2 + (pole2[2] - pole1[2])**2)
#
#def group_wires_with_dbscan(wire_locations, eps_fraction=0.1, min_samples=2):
#    groups = []
#
#    for key, wires in wire_locations.items():
#        group = {}
#        # Parse the key to extract pole coordinates
#        pole1, pole2 = key
#
#        # Calculate the span distance between poles
#        span_distance = calculate_distance(pole1, pole2)
#
#        # Set eps as a fraction of the span distance
#        eps = span_distance * eps_fraction
#
#        # Convert points to numpy array for clustering
#        points = np.array(wires)
#
#        # Apply DBSCAN clustering
#        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
#        dbscan.fit(points)
#
#        # Retrieve cluster labels
#        cluster_labels = dbscan.labels_
#
#        # Organize wires into groups based on cluster labels
#        for i, wire in enumerate(wires):
#            label = cluster_labels[i]
#            if label != -1:  # Exclude noise points (label == -1)
#                if label not in group:
#                    group[label] = []
#                group[label].append(wire)
#        groups.append(group)

#def group_wires_with_dbscan(wire_locations, eps=0.15, min_samples=100):
#    groups = []
#
#    for key, wires in wire_locations.items():
#        group = {}
#        # Convert points to numpy array for clustering
#        points = np.array(wires)
#
#        # Preprocess the points (normalize)
#        processed_points = points - points.min(axis=0)
#        processed_points /= processed_points.max(axis=0)
#
#        # Apply DBSCAN clustering
#        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
#        dbscan.fit(processed_points)
#
#        # Retrieve cluster labels
#        cluster_labels = dbscan.labels_
#
#        # Organize wires into groups based on cluster labels
#        for i, wire in enumerate(wires):
#            label = cluster_labels[i]
#            if label != -1:  # Exclude noise points (label == -1)
#                if label not in group:
#                    group[label] = []
#                group[label].append(wire)
#        groups.append(group)
#
#    return groups
#def group_wires_with_dbscan(wire_locations, eps=15.0, min_samples=1):
#    groups = [] 
#
#    for key, wires in wire_locations.items():
#        group = {}
#        # Convert points to numpy array for clustering
#        points = np.array(wires)
#
#        # Apply DBSCAN clustering
#        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
#        dbscan.fit(points)
#
#        # Retrieve cluster labels
#        cluster_labels = dbscan.labels_
#
#        for i, wire in enumerate(wires):
#            label = cluster_labels[i]
#            if label != -1:  # Exclude noise points (label == -1)
#                if label not in group:
#                    group[label] = []
#                group[label].append(wire)
#        groups.append(group)
#
#    return groups

def find_best_dbscan_params(wire_locations, eps_values, min_samples_values):
    best_groups = None
    min_num_clusters = float('inf')

    for eps in eps_values:
        for min_samples in min_samples_values:
            groups = group_wires_with_dbscan(wire_locations, eps=eps, min_samples=min_samples)
            num_clusters = sum(len(group) for group in groups)

            print(f"eps: {eps}, min_samples: {min_samples}, num_clusters: {num_clusters}")

            if num_clusters < min_num_clusters:
                min_num_clusters = num_clusters
                best_groups = groups

    return best_groups, min_num_clusters

def group_wires_with_dbscan(wire_locations, eps=100.0, min_samples=100):
    groups = []

    for key, wires in wire_locations.items():
        group = {}
        # Convert points to numpy array for clustering
        points = np.array(wires)

        # Normalize the points
        scaler = StandardScaler()
        points_normalized = scaler.fit_transform(points)

        # Apply DBSCAN clustering
        dbscan = DBSCAN(eps=eps, min_samples=min_samples)
        dbscan.fit(points_normalized)

        # Retrieve cluster labels
        cluster_labels = dbscan.labels_

        for i, wire in enumerate(wires):
            label = cluster_labels[i]
            if label != -1:  # Exclude noise points (label == -1)
                if label not in group:
                    group[label] = []
                group[label].append(wire)
        groups.append(group)

    return groups

#def merge_clusters(groups, distance_threshold=5):
#    merged_groups = []
#
#    for group in groups:
#        merged_group = {}
#        cluster_keys = list(group.keys())
#        visited = set()
#
#        for i, key1 in enumerate(cluster_keys):
#            if key1 in visited:
#                continue
#            merged_cluster = np.array(group[key1])
#            visited.add(key1)
#
#            for j, key2 in enumerate(cluster_keys):
#                if i == j or key2 in visited:
#                    continue
#                cluster1 = np.array(group[key1])
#                cluster2 = np.array(group[key2])
#
#                # Calculate the distance between the clusters
#                dist = cdist(cluster1[:, :3], cluster2[:, :3]).min()  # Use only x, y, z for distance calculation
#                if dist < distance_threshold:
#                    merged_cluster = np.vstack([merged_cluster, cluster2])
#                    visited.add(key2)
#
#            # Add merged cluster to the merged group
#            merged_group[i] = merged_cluster
#
#        merged_groups.append(merged_group)
#
#    return merged_groups
def merge_clusters(groups, distance_threshold=5):
    merged_groups = []

    for group in groups:
        merged_group = {}
        cluster_keys = list(group.keys())
        visited = set()

        for i, key1 in enumerate(cluster_keys):
            if key1 in visited:
                continue
            merged_cluster = np.array(group[key1])
            visited.add(key1)

            for j, key2 in enumerate(cluster_keys):
                if i == j or key2 in visited:
                    continue
                cluster1 = np.array(group[key1])
                cluster2 = np.array(group[key2])

                dist = cdist(cluster1[:, :3], cluster2[:, :3]).min()
                if dist < distance_threshold:
                    merged_cluster = np.vstack([merged_cluster, cluster2])
                    visited.add(key2)

            merged_group[len(merged_group)] = merged_cluster

        merged_groups.append(merged_group)

    return merged_groups
#def merge_clusters(groups, distance_threshold=5):
#    merged_groups = []
#
#    for group in groups:
#        merged_group = {}
#        cluster_keys = list(group.keys())
#        visited = set()
#        next_cluster_label = 0
#
#        for i, key1 in enumerate(cluster_keys):
#            if key1 in visited:
#                continue
#            merged_cluster = np.array(group[key1])
#            visited.add(key1)
#
#            for j, key2 in enumerate(cluster_keys):
#                if i == j or key2 in visited:
#                    continue
#                cluster1 = np.array(group[key1])
#                cluster2 = np.array(group[key2])
#
#                dist = cdist(cluster1[:, :3], cluster2[:, :3]).min()
#                if dist < distance_threshold:
#                    merged_cluster = np.vstack([merged_cluster, cluster2])
#                    visited.add(key2)
#
#            merged_group[next_cluster_label] = merged_cluster
#            next_cluster_label += 1
#
#        merged_groups.append(merged_group)
#
#    return merged_groups
if __name__ == '__main__':
    las_file_path = './input.las'  # Get the las file path from command line arguments

    # need to fetch saved markers
    file_path = "temp.json"
    with open(file_path, 'r') as file:
        data = json.load(file)

    #poles = extract_geo_positions(data)
    poles = seperate_poles(data)

    pole_locations = extract_pole_locations(las_file_path)
    grouped_poles = group_poles(pole_locations)

    #poles = seperate_poles(data)
    chosen_grouped_poles = find_chosen_pole_groups(poles, grouped_poles)
    pole_edges = find_pole_edges(chosen_grouped_poles)

    wire_coords = extract_wire_locations(las_file_path)
    wire_locations = find_wire_locations_by_x(data, wire_coords)
    excluded_wire_locations = exclude_poles_from_wires(pole_edges, wire_locations)

    #for label, wires in excluded_wire_locations.items():
    #    i = 0
    #    print(f"cluster {label}")
    #    for wire in wires:
    #        if i == 250:
    #            break
    #        else:
    #            print(wire)
    #            i+=1
    #    print()

    wires = group_wires_with_dbscan(excluded_wire_locations)
    #eps_values = [1.0, 1.5, 2.0, 2.5]
    #min_samples_values = [1, 2, 3, 4]

    #best_groups, min_num_clusters = find_best_dbscan_params(excluded_wire_locations, eps_values, min_samples_values)
    #print("Best groups:", best_groups)
    #print("Minimum number of clusters:", min_num_clusters)

    for i, wire_group in enumerate(wires):
        print(f"wire group {i + 1}:")
        i = 0
        for label, wires in wire_group.items():
            print(f"cluster {label}")
            for wire in wires:
                if i == 100:
                    break
                i += 1
                print(wire)



    lowest_midspan_locations = find_wires_above_lowest_midspan(excluded_wire_locations)

    # Write all clusters to a single JSON file
    output_filename = 'all_clusters.json'
    with open(output_filename, 'w') as f:
        json.dump(lowest_midspan_locations, f, indent=4, default=lambda x: x.tolist())  



    #print(json.dumps(midspans))
    #write_midspan_to_json(midspans)

#if __name__ == '__main__':
#    las_file_path = sys.argv[1]  # Get the las file path from command line arguments
#    data = sys.argv[2]  # Get the data file path from command line arguments
#
#    print(data)
#
#    pole_locations = extract_pole_locations(las_file_path)
#    grouped_poles = group_poles(pole_locations)
#
#    #poles = seperate_poles(data)
#    chosen_grouped_poles = find_chosen_pole_groups(poles, grouped_poles)
#    pole_edges = find_pole_edges(chosen_grouped_poles)
#
#    wire_coords = extract_wire_locations(las_file_path)
#    wire_locations = find_wire_locations_by_x(data, wire_coords)
#    midspan_wire_locations = exclude_poles_from_wires(pole_edges, wire_locations)
#
#    midspans = []
#    for key, midspan in midspan_wire_locations.items():
#        for point in midspan:
#            midspans.append(point)
#            break
#
#    print(json.dumps(midspans))
    #write_midspan_to_json(midspans)
#if __name__ == '__main__':
#    # Example wire_locations dictionary with hypothetical data
#    las_file_path = "../input.las"
#
#    # need to fetch saved markers
#    file_path = "temp_data.json"
#    with open(file_path, 'r') as file:
#        data = json.load(file)
#
#    pole_locations = extract_pole_locations(las_file_path)
#    grouped_poles = group_poles(pole_locations)
#
#    poles = seperate_poles(data)
#    chosen_grouped_poles = find_chosen_pole_groups(poles, grouped_poles)
#    pole_edges = find_pole_edges(chosen_grouped_poles)
#
#    #TODO[] exclude all wire classifications between these groups
#
#    wire_coords = extract_wire_locations(las_file_path)
#    wire_locations = find_wire_locations_by_x(data, wire_coords)
#    midspan_wire_locations = exclude_poles_from_wires(pole_edges, wire_locations)
#
#    midspans = []
#    for key, midspan in midspan_wire_locations.items():
#        for point in midspan:
#            midspans.append(point)
#            break
#
#    write_midspan_to_json(midspans)
