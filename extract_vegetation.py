def extract_pole_locations(las_file_path, veg_classification=3):
    las = laspy.read(las_file_path)
    points = las.points
    classifications = points.classification
    pole_mask = classifications == veg_classification
    veg_points = points[pole_mask]
    x = veg_points.x
    y = veg_points.y
    z = veg_points.z
    height_above_ground_meters = veg_points['HeightAboveGround']

    # Convert height above ground from meters to feet
    height_above_ground_feet = height_above_ground_meters * 3.28084

    # Stack coordinates and converted height
    coords = np.vstack((x, y, z, height_above_ground_feet)).transpose()
    return coords

if __name__ == 'main':
    #las_data_stream = sys.stdin.buffer.read()
    las_file_path = './filtered.las'
    veg_locations = extract_pole_locations(las_file_path)
    #json_output = poles_to_json(grouped_poles)
    #print(json_output)
