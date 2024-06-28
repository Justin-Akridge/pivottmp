
export function localToGeographic(x, y) {
  const utmZone = '+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs';
  const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
  const [lng, lat] = proj4(utmZone, wgs84, [x, y]);
  return { lat, lng };
}

