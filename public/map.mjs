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

let streetViewTabOpened = false;
let streetView;
let pegmanMarker;

export async function initMap(coords) {
  const mapOptions = {
    center: { lat: coords.lat, lng: coords.lng },
    mapId: '174211dc9f8dbb94',
		zoomControl: false,
		scaleControl: true,
		fullscreenControl: false,
		mapTypeControl: false,
		mapTypeId: google.maps.MapTypeId.HYBRID,
		tilt: 0,
		gestureHandling: 'greedy',
		maxZoom: 21, 
		minZoom: 0, 
    streetViewControl: true
  };

  const map = new google.maps.Map(document.getElementById("map"), mapOptions);
  const poleLocations = await loadPolePositions(id);
  const wirePaths = await loadWirePaths(id);

  poleLocations.forEach(location => {
    initializeMarker(location, map);
  })

  wirePaths.forEach(item => {
    createNewPath(item[0], item[1], map)
  })

  if (markers.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    markers.forEach(marker => {
      bounds.extend(marker.position);
    });
    map.fitBounds(bounds);
    map.setZoom(map.getZoom());
  }

  const panorama = new google.maps.StreetViewPanorama(
    document.getElementById("pano"),
    {
      position: { lat: 42.345573, lng: -71.098326 },
      addressControlOptions: {
        position: google.maps.ControlPosition.BOTTOM_CENTER,
      },
      linksControl: false,
      panControl: false,
      enableCloseButton: false,
    },
  );


  streetView = map.getStreetView();

  // Listen for visibility change of Street View
  streetView.addListener('visible_changed', function() {
  if (streetView.getVisible() && !streetViewTabOpened) {
    streetView.setVisible(false); // Hide Street View in the map

    const position = streetView.getPosition();

    if (position) {
      openStreetViewInNewTab(position.lat(), position.lng());
      streetViewTabOpened = true;
    }
  }
});

  //streetView.addListener('visible_changed', function() {
  //  if (streetView.getVisible() && !streetViewTabOpened) {
  //    streetView.setVisible(false); // Hide Street View in the map

  //    setiitimeout(() => {
  //    }, 1000)
  //    const position = streetView.getPosition();
  //    openStreetViewInNewTab(position.lat(), position.lng());

  //    streetViewTabOpened = true;
  //  }
  //});

  // Create Pegman marker
  //pegmanMarker = new google.maps.Marker({
  //  position: map.getCenter(),
  //  icon: {
  //    size: new google.maps.Size(34, 54),
  //    anchor: new google.maps.Point(17, 54) // Center bottom point of the marker
  //  },
  //  map: map,
  //  draggable: true,
  //  title: 'Drag me!'
  //});

  // Listen for drag end of Pegman marker
  google.maps.event.addListener(pegmanMarker, 'dragend', function() {
    const position = pegmanMarker.getPosition();
    streetView.setPosition(position);
    //streetView.setVisible(true); // Show Street View at the Pegman marker position
  });

  // Function to open Street View in a new tab
  function openStreetViewInNewTab(lat, lng) {
    const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    const newTab = window.open(url, '_blank');
  }
}

function handlePegmanDrag() {
  if (!streetViewOpenedOnce) {
    streetViewOpenedOnce = true;
    streetView.setVisible(true); // Show Street View in the embedded map
  }
}

let numberOverlays = [];
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
  marker.addListener('dblclick', (e) => handleMarkerDblClick(marker, map));
  markers.push(marker);
  
  const overlay = addNumberOverlayForMarkers(marker, markers.length, map);
  numberOverlays.push(overlay)
}

function addNumberOverlayForMarkers(marker, number, map) {
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = function () {
      const div = document.createElement('div');
      div.className = 'distance-overlay';
      div.innerHTML = `${number}`;
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
      const position = projection.fromLatLngToDivPixel(new google.maps.LatLng(marker.position.lat(), marker.position.lng()));
      const div = this.div;
      div.style.left = position.x + 'px';
      div.style.top = position.y + 'px';
    };

    overlay.onRemove = function () {
      this.div.parentNode.removeChild(this.div);
      this.div = null;
    };

    overlay.setMap(map);
    return overlay;
}

async function loadWirePaths(id) {
  try {
    const response = await fetch('/paths.json');
    const data = await response.json();
    return data;
	} catch (error) {
		console.error('Error fetching wire paths:', error);
	}
}

async function loadPolePositions(id) {
	try {
    const response = await fetch(`http://localhost:3000/getMarkersAndPaths/${id}`)
    
    if (!response.ok) {
      throw new Error("Failed to fetch job saved status");
    }
    const data = await response.json();
    return data;
    //return { markers : data[0].markers, paths : data[0].paths, saved: true };

	} catch (error) {
		console.error('Error fetching pole Locations:', error);
    return [];
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

function createNewPath(firstLoc, secondLoc, map) {
  let firstPole = null; 
  let secondPole = null;
  
  markers.forEach(marker => {
    if (marker.geoPosition['x'] === firstLoc['x'] && marker.geoPosition['y'] === firstLoc['y']) {
      firstPole = marker;
    }

    if (marker.geoPosition['x'] === secondLoc['x'] && marker.geoPosition['y'] === secondLoc['y']) {
      secondPole = marker;
    }
  })

  const path = [firstPole.position, secondPole.position];
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


//angles for map
const angleRight = document.querySelector('.fa-angle-right');
const angleLeft = document.querySelector('.fa-angle-left');
const angleContainer = document.getElementById('angle-container');
const renderArea = document.getElementById("potree_render_area");
const poleInformation = document.getElementById("pole-information")
let poleInformationBoxOpen = false;
let arrowIsDisplayed = false;
let viewerIsOpen = false;

angleRight.addEventListener('click', function() {
  angleLeft.style.display = 'flex';
  angleRight.style.display = 'none';
  if (poleInformationBoxOpen) {
    angleContainer.style.left = '635px';
  } else {
    angleContainer.style.left = '935px';
  }
  viewerIsOpen = true
  openViewer();

});

angleLeft.addEventListener('click', function() {
  angleRight.style.display = 'flex';
  angleLeft.style.display = 'none';
  angleContainer.style.left = '0px';
  closeViewer();
  viewerIsOpen = false;
});

function closeViewer() {
  renderArea.style.display = 'none';
}

function openViewer() {
  renderArea.style.display = 'block';
}

function handleMarkerClick(marker, map) {
  const geoPosition = marker.geoPosition;
  targetTo(viewer, new THREE.Vector3(geoPosition.x, geoPosition.y, geoPosition.z), 0.02);

  if (arrowIsDisplayed) {
    return;
  } else {
    angleRight.style.display = 'flex';
    arrowIsDisplayed = true;
  }
}

function handleMarkerDblClick(marker) {
  poleInformationBoxOpen = true; 
  poleInformation.style.display = 'block'

  renderArea.style.display = 'block';
  angleContainer.style.left = '635px';
  angleLeft.style.display = 'flex';
  angleRight.style.display = 'none';
}

document.addEventListener('keyup', function(event) {
  if (event.key === 'Escape' || event.keyCode === 27) {
    selectedMarker = null;
    if (poleInformationBoxOpen) {
      poleInformation.style.display = 'none'
      poleInformationBoxOpen = false; 
      angleContainer.style.left = '935px';
    }

    if (arrowIsDisplayed && !viewerIsOpen) {
      angleRight.style.display = 'none';
      arrowIsDisplayed = false;
    }
  }
});

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


// VEGETATION ENCROACHMENTS
let vegetationToolActive = false;
let vegetationEncroachments = [];
let fetchedFromServer = false;

const vegetationTool = document.querySelector('.vegetation-tool');
vegetationTool.addEventListener('click', toggleVegetationTool);

function toggleVegetationTool() {
  vegetationToolActive = !vegetationToolActive;

  if (vegetationToolActive) {
    fetchVegetationEncroachments()
    displayVegetationEncroachments();
  } else {
    removeVegetationEncroachments();
  }
}

function displayVegetationEncroachments() {
  if (vegetationEncroachments.length === 0) {
    //popup displaying no vegetation encroachments
  } else {
    //add markers to map and scene
  }
  
  
}

function removeVegetationEncroachments() {
  if (vegetationEncroachments.length === 0) {
    return;
  } else {
    // remove markers and annotations from map/scene
  }
}

async function fetchVegetationEncroachments() {
  if (fetchedFromServer) return;
  try {
    const response = await fetch(`/vegetationEncroachments/${id}`)
    if (!response.ok) {
      throw new Error('Failed to fetch vegetation encroachments');
    }

    //server should return empty array in none
    vegetationEncroachments = await response.json()
    fetchedFromServer = true;

  } catch (error) {
    console.error('Error fetching vegetation encroachments from the server', error.message);
  }
}
