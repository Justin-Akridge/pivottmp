import * as THREE from '/libs/three.js/build/three.module.js';
import { localToGeographic } from './utils.mjs'
import viewer from './main.js';
let path = window.location.pathname
let segments = path.split('/');
let id = segments.pop(); 

let markers = []
let paths = []
let polylines = []
let selectedMarker = null;

export async function initMap(coords) {
  const mapOptions = {
    center: { lat: coords.lat, lng: coords.lng },
    mapId: '174211dc9f8dbb94',
		zoomControl: false,
		scaleControl: true,
		fullscreenControl: true,
		mapTypeControl: false,
		mapTypeId: google.maps.MapTypeId.HYBRID,
		tilt: 0,
		gestureHandling: 'greedy',
		maxZoom: 21, 
		minZoom: 0, 
  };

  const map = new google.maps.Map(document.getElementById("map"), mapOptions);
  const poleLocations = await loadPolePositions(id);

  poleLocations.forEach(location => {
    initializeMarker(location, map);
  })

  //poleLocations.paths.forEach(item => {
  //  createNewPath(item[0], item[1], markersAndPathsSaved, map)
  //})

  if (markers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(marker => {
      bounds.extend(marker.position);
    });
    map.fitBounds(bounds);
    map.setZoom(map.getZoom());
  }
}

function initializeMarker(location, map) {
  //let locationLatLng = localToGeographic(location.geoPosition.x, location.geoPosition.y);
  const position = new google.maps.LatLng(location.mapPosition.lng, location.mapPosition.lat);
  const markerOptions = {
    geoPosition: {
      "x": location.geoPosition.x,
      "y": location.geoPosition.y,
      "z": location.geoPosition.z,
    },
    position: position,
    map: map,
    selected: false,
    icon: MarkerIcon('aerial', true),
    draggable: false,
  };

  const marker = new google.maps.Marker(markerOptions);
  marker.addListener('click', (e) => handleMarkerClick(marker, map));
  markers.push(marker);
  //marker.setMap(map);
}

async function loadPolePositions(id) {
	try {
    const response = await fetch(`http://localhost:3000/getMarkersAndPaths/${id}`)
    const data = await response.json();
    return data;
    //return { markers : data[0].markers, paths : data[0].paths, saved: true };

    if (!response.ok) {
      throw new Error("Failed to fetch job saved status");
    }
	} catch (error) {
    return [];
		console.error('Error fetching pole Locations:', error);
	}
}

// TODO NEED TO ADD REFERENCE END POINT
const MarkerIcon = (markerType, isSelected) => {
  if (markerType === 'aerial') {
    const scale = 6;
    const color = "red"
    const opacity = isSelected ? 1 : 0.3;
    const glowColor = isSelected ? 'gold' : '';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${scale * 4}" height="${scale * 4}">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="12" cy="12" r="${scale}" fill="${color}" fill-opacity="${opacity}" ${isSelected ? `stroke="${glowColor}" stroke-width="1.5" filter="url(#glow)"` : ''} />
      </svg>
    `;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new window.google.maps.Size(scale * 4, scale * 4),
      anchor: new window.google.maps.Point(scale * 2, scale * 2)
    };
  } else if (markerType === 'reference') {
    const glowColor = "#f700ff";
    const scale = 2;
    const color = "#f700ff";
    const selectedColor = "#f700ff";

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${scale * 4}" height="${scale * 4}">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <polygon
          points="12,2 15,9 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,9"
          fill="${isSelected ? selectedColor : color}"
          ${isSelected ? `stroke="${glowColor}" stroke-width="2" filter="url(#glow)"` : ''}
        />
      </svg>
    `;

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new window.google.maps.Size(scale * 4, scale * 4),
      anchor: new window.google.maps.Point(scale * 2, scale * 2)
    };
  }
};

function createNewPath(firstMarker, secondMarker, markersAndPathsSaved, map) {
  const firstPole = {
    mapPosition: firstMarker.mapPosition,
    geoPosition: firstMarker.geoPosition,
  };

  const secondPole = {
    mapPosition: secondMarker.mapPosition,
    geoPosition: secondMarker.geoPosition,
  };

  const path = [firstPole.mapPosition, secondPole.mapPosition];
  const newPath = [firstPole, secondPole];
  paths.push(newPath);

  let color = 'limegreen';
  const polyline = new google.maps.Polyline({
    path: path,
    map: map,
    strokeColor: color,
    strokeWeight: 3
  });

  createOverlayForPolyline(path, polyline, map);
  polylines.push(polyline);
}

function createOverlayForPolyline(path, polyline, map) {
  path.slice(0, -1).forEach((point, index) => {
    const start = new google.maps.LatLng(point.lat, point.lng);
    const end = new google.maps.LatLng(path[index + 1].lat, path[index + 1].lng);
    const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(start, end);
    const distanceFeet = distanceMeters * 3.28084;
    const middlePoint = {
      lat: (point.lat + path[index + 1].lat) / 2,
      lng: (point.lng + path[index + 1].lng) / 2
    };

    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function () {
      const div = document.createElement('div');
      div.className = 'distance-overlay';
      div.innerHTML = `${distanceFeet.toFixed(2)}'`;
      div.style.width = 'fit-content';
      div.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
      div.style.padding = '2px 5px';
      div.style.borderRadius = '3px';
      div.style.position = 'absolute';
      this.getPanes().floatPane.appendChild(div);
      this.div = div;
    };

    overlay.draw = function () {
      const projection = this.getProjection();
      const position = projection.fromLatLngToDivPixel(new google.maps.LatLng(middlePoint.lat, middlePoint.lng));
      const div = this.div;
      div.style.left = position.x + 'px';
      div.style.top = position.y + 'px';
    };

    overlay.onRemove = function () {
      this.div.parentNode.removeChild(this.div);
      this.div = null;
    };

    overlay.setMap(map);
    polyline.overlay = overlay;
    polylines.push(polyline);
  });
}

document.addEventListener('keyup', function(event) {
  if (event.key === 'Escape' || event.keyCode === 27) {
    selectedMarker = null;
  }
});

function handleMarkerClick(marker, map) {
  const geoPosition = marker.geoPosition;
  console.log(marker)
  targetTo(viewer, new THREE.Vector3(geoPosition.x, geoPosition.y, geoPosition.z), 0.02);
}


function targetTo(viewer, target) {
  const {view} = viewer.scene;
  viewer.scene.orbitControls = true;

  let d = viewer.scene.view.direction.multiplyScalar(-1);
  let cameraTargetPosition = new THREE.Vector3().addVectors(target, d.multiplyScalar(10));
  let animationDuration = 400;
  let easing = TWEEN.Easing.Quartic.Out;

  let tweens = []

    {
      let value = {x: 0};
      let tween = new TWEEN.Tween(value).to({x: animationDuration});
      tween.easing(easing);
      tweens.push(tween);

      let startPos = viewer.scene.view.position.clone();
      let targetPos = cameraTargetPosition.clone();
      let startRadius = viewer.scene.view.radius;
      let targetRadius = cameraTargetPosition.distanceTo(target)

      tween.onUpdate(() => {
        let t = value.x / animationDuration;
        viewer.scene.view.position.x = (1 - t) * startPos.x + t * targetPos.x;
        viewer.scene.view.position.y = (1 - t) * startPos.y + t * targetPos.y;
        viewer.scene.view.position.z = (1 - t) * startPos.z + t * targetPos.z + 2;

        viewer.scene.view.radius = (1 - t) * startRadius + t * targetRadius;
        viewer.setMoveSpeed(viewer.scene.view.radius);
      });

      tween.onComplete(() => {
        tweens = tweens.filter(e => e !== tween);
      });

      tween.start();
    }
  view.position.copy(cameraTargetPosition);
};
