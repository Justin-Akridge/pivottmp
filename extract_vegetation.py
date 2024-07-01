import sys
import laspy
import numpy as np
import json
from sklearn.cluster import DBSCAN
from math import sqrt

def extract_veg_locations(las_file_path, veg_classification=3):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    veg_mask = classifications == veg_classification
    veg_points = points[veg_mask]
    x = veg_points.x
    y = veg_points.y
    z = veg_points.z
    height_above_ground_feet = veg_points['HeightAboveGround'] * 3.28084
    coords = np.vstack((x, y, z, height_above_ground_feet)).transpose()
    return coords

def extract_veg_locations(las_file_path, wire_classification=7):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    wire_mask = classifications == wire_classification
    wire_points = points[wire_mask]
    x = wire_points.x
    y = wire_points.y
    z = wire_points.z
    height_above_ground_feet = wire_points['HeightAboveGround'] * 3.28084
    coords = np.vstack((x, y, z, height_above_ground_feet)).transpose()
    return coords

def group_veg(coords, tolerance=5):
    dbscan = DBSCAN(eps=tolerance, min_samples=10)
    labels = dbscan.fit_predict(coords[:, :2])
    unique_labels = set(labels)
    grouped_vegs = []
    for label in unique_labels:
        veg_group_coords = coords[labels == label]
        if len(veg_group_coords) > 20:
            grouped_vegs.append(veg_group_coords.tolist())
    return grouped_vegs

def euclidean_distance(point1, point2):
    return sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def distance_from_first_pole(wire_points, first_pole):
    return euclidean_distance(wire_points, first_pole[:2])

def extract_wire_locations(las_file_path, wire_classification=7):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    wire_mask = classifications == wire_classification
    wire_points = points[wire_mask]

    x = wire_points.x
    y = wire_points.y
    z = wire_points.z
    height_above_ground_feet = wire_points['HeightAboveGround'] * 3.28084

    coords = np.vstack((x, y, z, height_above_ground_feet)).transpose()
    return coords

def find_wire_locations_by_x(paths, wire_locations, tolerance = 2):
    wire_map = {}
    for path in paths:
        if len(path) != 2:
            continue
        pole1 = path[0]
        pole2 = path[1]
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
            if wx >= min(x1, x2) and wx <= max(x1, x2) and wy >= min(y1,y2) and wy <= max(y1,y2):
                wire_map[key].append([wx, wy, wz, height])
        wire_map[key].sort(key=lambda point: distance_from_first_pole(point, (x1, y1, z1, height)[:2]))
    return wire_map

def find_wires(wire_locations, max_distance=1.0):
    wires = {}

    for pole, points in wire_locations.items():
        print(points)
        wire_points = []

        for point in points:
            if point not in wire_points:
                wire_path = trace_wire_path(point, points, max_distance)
                wire_points.extend(wire_path)

        wires[pole] = wire_points

    return wires

def extract_geo_paths(paths):
    geo_paths = []
    for path in paths:
        if 'path' in path and 'geo' in path['path']:
            geo_paths.append(path['path']['geo'])
    return geo_paths

#def find_veg_near_midspan(wire_locations, veg_groups, tolerance=1):
#    veg_near_midspan = {}
#
#    for key, midspan_points in wire_locations.items():
#        veg_near_midspan[key] = []
#
#        for veg_group in veg_groups:
#            for veg_point in veg_group:
#                for midspan_point in midspan_points:
#                    if euclidean_distance(midspan_point[:3], veg_point[:3]) <= tolerance:
#                        veg_near_midspan[key].append(veg_point)
#                        break
#
#    return veg_near_midspan
def find_veg_near_midspan(geo_paths, veg_groups, tolerance=10):
    veg_near_midspan = {}

    for geo_path in geo_paths:
        if len(geo_path) != 2:
            continue

        pole1 = geo_path[0]
        pole2 = geo_path[1]

        # Define line segment by the two poles
        line_start = (pole1['x'], pole1['y'], pole1['z'])
        line_end = (pole2['x'], pole2['y'], pole2['z'])

        veg_near_midspan[(line_start, line_end)] = []

        for veg_group in veg_groups:
            closest_veg_point = None
            closest_distance = float('inf')
            for veg_point in veg_group:
                distance = distance_to_line_segment(veg_point[:3], line_start, line_end)
                if distance <= tolerance and distance < closest_distance:
                    closest_distance = distance
                    closest_veg_point = veg_point

            if closest_veg_point is not None:
                veg_near_midspan[(line_start, line_end)].append({
                    'position': closest_veg_point,
                    'dist': closest_distance
                })

    return veg_near_midspan

#def find_veg_near_midspan(geo_paths, veg_groups, tolerance=3):
#    veg_near_midspan = {}
#
#    for geo_path in geo_paths:
#        if len(geo_path) != 2:
#            continue
#
#        pole1 = geo_path[0]
#        pole2 = geo_path[1]
#
#        # Define line segment by the two poles
#        line_start = (pole1['x'], pole1['y'], pole1['z'])
#        line_end = (pole2['x'], pole2['y'], pole2['z'])
#
#        veg_near_midspan[(line_start, line_end)] = []
#
#        for veg_group in veg_groups:
#            closest_veg_point = None
#            closest_distance = float('inf')
#            for veg_point in veg_group:
#                distance = distance_to_line_segment(veg_point[:3], line_start, line_end)
#                if distance <= tolerance and distance < closest_distance:
#                    closest_distance = distance
#                    closest_veg_point = veg_point
#
#            if closest_veg_point is not None:
#                veg_near_midspan[(line_start, line_end)].append({
#                    'position': closest_veg_point,
#                    'dist': closest_distance
#                })
#
#        veg_near_midspan[(line_start, line_end)].append(veg_point)
#
#    return veg_near_midspan

def distance_to_line_segment(point, line_start, line_end):
    """
    Calculate perpendicular distance from point to line segment defined by line_start and line_end.
    """
    x, y, z = point
    x1, y1, z1 = line_start
    x2, y2, z2 = line_end

    vec_ap = np.array([x - x1, y - y1, z - z1])
    vec_ab = np.array([x2 - x1, y2 - y1, z2 - z1])
    proj = np.dot(vec_ap, vec_ab) / np.dot(vec_ab, vec_ab)
    if proj < 0:
        closest_point = np.array([x1, y1, z1])
    elif proj > 1:
        closest_point = np.array([x2, y2, z2])
    else:
        closest_point = np.array([x1 + proj * vec_ab[0], y1 + proj * vec_ab[1], z1 + proj * vec_ab[2]])

    distance_meters = np.linalg.norm(vec_ap - proj * vec_ab)
    distance_feet = distance_meters * 3.28084  # Convert meters to feet

    return distance_feet

if __name__ == '__main__':
    #midspans_data = sys.stdin.strip()
    #las_data_stream = sys.stdin.buffer.read()
    midspans_file_path = './midspans.json'
    las_data_stream = './18.las'

    with open(midspans_file_path, 'r') as file:
        midspans_data = json.load(file)
    geo_paths = extract_geo_paths(midspans_data)

    veg_locations = extract_veg_locations(las_data_stream)
    veg_groups = group_veg(veg_locations)

    veg_near_midspan = find_veg_near_midspan(geo_paths, veg_groups, tolerance=20)
    #print(json.dumps(veg_near_midspan))  # Output the result as JSON


    for line_segment, veg_points in veg_near_midspan.items():
        print(f"Line Segment: {line_segment}")
        for veg_point in veg_points:
            if isinstance(veg_point, dict):
                print(f"\tVegetation Point: {veg_point['position']}, Distance: {veg_point['dist']:.2f} feet")
            elif isinstance(veg_point, list):
                print(f"\tVegetation Point: {veg_point}, Distance: Not calculated")
            else:
                print(f"\tVegetation Point: {veg_point}, Distance: Unknown format")
        print()

    #wire_coords = extract_wire_locations(las_data_stream)
    #wire_locations = find_wire_locations_by_x(geo_paths, wire_coords)
