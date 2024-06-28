import { localToGeographic } from "./utils.mjs"
import { initMap } from "./map.mjs"
import * as THREE from '/libs/three.js/build/three.module.js';


let path = window.location.pathname
let segments = path.split('/');
let id = segments.pop(); 

const viewer = new Potree.Viewer(document.getElementById("potree_render_area"));
export default viewer;
await loadPointCloud()

async function fetchMetadata(id) {
  try {
    const response = await fetch(`/getMetadata/${id}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error('Error fetching octree data:', error);
  }
}

async function loadPointCloud() {
  const metadata = await fetchMetadata(id);
  Potree.loadPointCloud(`${metadata}`, id, e => {
    const pointCloud = e.pointcloud;
    viewer.scene.addPointCloud(pointCloud);

    let material = e.pointcloud.material;
    material.shape = Potree.PointShape.CIRCLE
    material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
    material.size = 0.1;
    material.activeAttributeName = "classification";
    viewer.fitToScreen()

    const pos = pointCloud.position
    const coords = localToGeographic(pos.x, pos.y);
    // initialize map with location of pointcoud position
    initMap(coords, viewer)
  })
}

function extractClassifiedPoints(pointCloud, classificationValue) {
  const polePoints = [];
  const root = pointCloud.pcoGeometry.root;
  // Recursive function to traverse the octree
  function traverse(node) {
    console.log(node)
    if (!node) return;

    if (node.loaded) {
      const buffer = node.geometryNode.geometry.attributes.classification.array;
      const positions = node.geometryNode.geometry.attributes.position.array;

      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] === classificationValue) {
          const x = positions[3 * i];
          const y = positions[3 * i + 1];
          const z = positions[3 * i + 2];
          console.log(x, y, z)
          polePoints.push({ x, y, z });
        }
      }
    }

    // Traverse child nodes
    for (const key in node.children) {
      if (node.children.hasOwnProperty(key)) {
        traverse(node.children[key]);
      }
    }
  }

  // Start traversal from the root
  traverse(root);

  return polePoints;
}



// TODO if any points are click make annotations
let points = []
let spheres = []
let lines = []
addPolesToPotree()
async function addPolesToPotree() {
  // Clear existing spheres
  spheres.forEach(sphere => {
    viewer.scene.scene.remove(sphere);
  });
  spheres = [];

  try {
    const response = await fetch('/getPoleLines');
    if (!response.ok) {
      throw new Error('Failed to fetch JSON file');
    }

    const poleLocations = await response.json();

    poleLocations.forEach(location => {
      const start = new THREE.Vector3(location.start_point[0], location.start_point[1], location.start_point[2]);
      const end = new THREE.Vector3(location.end_point[0], location.end_point[1], location.end_point[2]);

      // Create a geometry for the line
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);

      // Define material and create the line object
      const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 5 }); // Adjust linewidth here
      const line = new THREE.Line(geometry, material);

      // Add line to the scene
      viewer.scene.scene.add(line);
      lines.push(line);
    });
  } catch (error) {
    console.error('Error loading JSON file:', error);
    // Handle error loading JSON file
  }
}


//async function addPolesToPotree(poleLocations) {
//  spheres.forEach(sphere => {
//    viewer.scene.scene.remove(sphere); // Remove from scene
//  });
//  spheres = [];
//
//  console.log(poleLocations)
//  poleLocations.forEach(location => {
//    let geo = location.geoPosition ? location.geoPosition : location;
//    points.push(location);
//
//    const height = 10; // meters
//    const radius = 0.045;
//
//    const geometry = new THREE.CylinderGeometry(radius, radius, height, 64);  // Last number are the amount of sides
//    const material = new THREE.MeshPhongMaterial({ color: 0xffff00 });
//    const sphere = new THREE.Mesh(geometry, material);
//    const adjustedZ = geo.z + height / 2;
//
//    sphere.position.set(geo.x, geo.y, adjustedZ);
//
//    sphere.rotation.x = Math.PI / 2;
//    const drag = (e) => {
//      if (false/*draggingEnabled*/) {
//        let I = Potree.Utils.getMousePointCloudIntersection(
//          e.drag.end, 
//          e.viewer.scene.getActiveCamera(), 
//          e.viewer, 
//          e.viewer.scene.pointclouds,
//          {pickClipped: true}
//        );
//        console.log('i', I)
//
//        if (I) {
//          let i = spheres.indexOf(e.drag.object);
//          if (i !== -1) {
//            let point = points[i];
//
//            for (let key of Object.keys(point)) {
//              if (!I.point[key]) {
//                delete point[key];
//              }
//            }
//
//            for (let key of Object.keys(I.point).filter(e => e !== 'position')) {
//              point[key] = I.point[key];
//            }
//
//            sphere.position.set(I.location.x, I.location.y, I.location.z);
//            // this.setPosition(i, I.location); // Here, `this` should refer to the instance of the Measure class
//          }
//        }
//      }
//    };
//
//    const drop = (e) => {
//      if (true/*draggingEnabled*/) {
//        let I = Potree.Utils.getMousePointCloudIntersection(
//          e.drag.end, 
//          e.viewer.scene.getActiveCamera(), 
//          e.viewer, 
//          e.viewer.scene.pointclouds,
//          {pickClipped: true}
//        );
//        if (I) {
//          let i = spheres.indexOf(e.drag.object);
//          if (i !== -1) {
//            let point = points[i];
//
//            // loop through current keys and cleanup ones that will be orphaned
//            for (let key of Object.keys(point)) {
//              if (!I.point[key]) {
//                delete point[key];
//              }
//            }
//
//            for (let key of Object.keys(I.point).filter(e => e !== 'position')) {
//              point[key] = I.point[key];
//            }
//
//            sphere.position.set(I.location.x, I.location.y, I.location.z);
//            // this.setPosition(i, I.location); // Here, `this` should refer to the instance of the Measure class
//          }
//        }
//      }
//    };
//
//    const mouseover = (e) => e.object.material.emissive.setHex(0xff0000);
//    const mouseleave = (e) => e.object.material.emissive.setHex(0x000000);
//
//    //sphere.addEventListener('drag', drag);
//    //sphere.addEventListener('drop', drop);
//    sphere.addEventListener('mouseover', mouseover);
//    sphere.addEventListener('mouseleave', mouseleave);
//
//    viewer.scene.scene.add(sphere);
//    spheres.push(sphere);
//  });
//}

let intersects = []
window.addEventListener('click', (e) => {
	console.log(e)
    const findPoint = intersects.find((hit) => hit.object === points);
    if (findPoint) {
      console.log("Point found:", findPoint.point);
    }
});

function addAnnotation(location) {
  const annotation = new Potree.Annotation({
    position: new THREE.Vector3(location[0], location[1], location[2]),
    title: `Height: ${location[3]} ft`,
  });
  viewer.scene.annotations.add(annotation);
}
