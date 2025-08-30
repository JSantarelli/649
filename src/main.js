import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c3e50);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = document.getElementById('map');
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvas.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,    
  0.4,    
  0.85    
);

composer.addPass(bloomPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

const textureLoader = new THREE.TextureLoader();

const textures = {
  terrain: null,
  water: null
};

const ISLAND_HEIGHT = .5; 

let dateRange = {
  startDate: new Date(1982, 3, 2), 
  endDate: new Date(1982, 6, 8),  
  minDate: new Date(1982, 3, 2),
  maxDate: new Date(1982, 5, 14),
  currentStart: new Date(1982, 3, 2),
  currentEnd: new Date(1982, 6, 8)
};

let globalBounds = null;
let eventosData = [];


let ageTracker = {
  totalAge: 0,
  casualtyCount: 0,
  averageAge: 0,
  ageHistory: [] 
};

const datasets = {
  armada: {
    file: './data/fallecidosArmada.geojson',
    color: 0x0066cc,
    name: 'Armada',
    group: new THREE.Group(),
    visible: true,
    allMarkers: [] 
  },
  ea: {
    file: './data/fallecidosEA.geojson',
    color: 0x00FF66,
    name: 'Ejército Argentino',
    group: new THREE.Group(),
    visible: true,
    allMarkers: []
  },
  ffa: {
    file: './data/fallecidosFFA.geojson',
    color: 0x00FFFF,
    name: 'Fuerza Aérea',
    group: new THREE.Group(),
    visible: true,
    allMarkers: []
  },
  gna: {
    file: './data/fallecidosGNA.geojson',
    color: 0xffd700,
    name: 'Gendarmería',
    group: new THREE.Group(),
    visible: true,
    allMarkers: []
  },
  pna: {
    file: './data/fallecidosPNA.geojson',
    color: 0xff6347,
    name: 'Prefectura',
    group: new THREE.Group(),
    visible: true,
    allMarkers: []
  },
  pnc: {
    file: './data/fallecidosContinente.geojson',
    color: 0x634eff,
    name: 'Continente',
    group: new THREE.Group(),
    visible: true,
    allMarkers: []
  },
};

let malvinasGroup = new THREE.Group();
scene.add(malvinasGroup);

Object.values(datasets).forEach(dataset => {
  scene.add(dataset.group);
  dataset.group.name = dataset.name;
});

function convertISO8601ToDateString(isoString) {
  if (!isoString || typeof isoString !== 'string') {
    return isoString; 
  }
  
  const ddmmyyyyPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  if (ddmmyyyyPattern.test(isoString)) {
    return isoString; 
  }
  
  const iso8601Pattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?)?$/;
  if (iso8601Pattern.test(isoString)) {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) {
        return isoString; 
      }
      
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.warn('Error converting ISO date:', isoString, error);
      return isoString; 
    }
  }
  
  const yyyymmddPattern = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
  if (yyyymmddPattern.test(isoString)) {
    const [year, month, day] = isoString.split('/');
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  
  const mmddyyyyPattern = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  if (mmddyyyyPattern.test(isoString)) {
    const [first, second, year] = isoString.split('/');
    const firstNum = parseInt(first);
    const secondNum = parseInt(second);
    
    if (firstNum > 12) {
      return isoString;
    }
    else if (secondNum > 12) {
      return `${second.padStart(2, '0')}/${first.padStart(2, '0')}/${year}`;
    }
    else {
      return isoString;
    }
  }
  
  return isoString; 
}

function normalizeFeatureDates(feature) {
  if (feature.properties) {
    const normalizedProps = { ...feature.properties };
    
    const dateProperties = ['F_Deceso', 'F_Deces', 'F_Nac', 'fecha_deceso', 'fecha_nacimiento'];
    
    dateProperties.forEach(prop => {
      if (normalizedProps[prop]) {
        const originalDate = normalizedProps[prop];
        const convertedDate = convertISO8601ToDateString(originalDate);
        
        normalizedProps[prop] = convertedDate;
        
        if (prop === 'F_Deces' && !normalizedProps['F_Deceso']) {
          normalizedProps['F_Deceso'] = convertedDate;
        }
        
        if (originalDate !== convertedDate) {
          console.log(`Converted date: ${originalDate} -> ${convertedDate} (property: ${prop})`);
        }
      }
    });
    
    return {
      ...feature,
      properties: normalizedProps
    };
  }
  
  return feature;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.toLowerCase().includes('sin fecha')) {
    return new Date(1982, 4, 2); 
  }
  
  try {
    const normalizedDateStr = convertISO8601ToDateString(dateStr);
    const cleanStr = String(normalizedDateStr).trim();
    const [day, month, year] = cleanStr.split('/').map(num => parseInt(num));
    
    if (!day || !month || !year) {
      return new Date(1982, 4, 2);
    }
    
    let fullYear;
    if (year < 100) {
      fullYear = year < 50 ? 1900 + year : 1900 + year;
    } else {
      fullYear = year;
    }
    
    return new Date(fullYear, month - 1, day);
  } catch (error) {
    console.warn('Error parsing date:', dateStr, error);
    return new Date(1982, 4, 2);
  }
}

function isDateInRange(dateStr, startDate, endDate) {
  const date = parseDate(dateStr);
  return date >= startDate && date <= endDate;
}

function formatDateForDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function calculateAverageAge() {
  let totalAge = 0;
  let casualtyCount = 0;
  let ages = [];
  
  Object.entries(datasets).forEach(([key, dataset]) => {
    if (dataset.visible) {
      dataset.allMarkers.forEach(markerData => {
        const isInDateRange = isDateInRange(
          markerData.userData.F_Deceso, 
          dateRange.currentStart, 
          dateRange.currentEnd
        );
        
        if (isInDateRange && markerData.userData.age) {
          totalAge += markerData.userData.age;
          casualtyCount++;
          ages.push(markerData.userData.age);
        }
      });
    }
  });
  
  const averageAge = casualtyCount > 0 ? totalAge / casualtyCount : 0;
  
  const minAge = ages.length > 0 ? Math.min(...ages) : 0;
  const maxAge = ages.length > 0 ? Math.max(...ages) : 0;
  
  
  const sortedAges = ages.sort((a, b) => a - b);
  const medianAge = sortedAges.length > 0 
    ? sortedAges.length % 2 === 0 
      ? (sortedAges[sortedAges.length / 2 - 1] + sortedAges[sortedAges.length / 2]) / 2
      : sortedAges[Math.floor(sortedAges.length / 2)]
    : 0;
  
  ageTracker = {
    totalAge,
    casualtyCount,
    averageAge,
    minAge,
    maxAge,
    medianAge,
    ageDistribution: ages
  };
  
  return ageTracker;
}

function updateAgeDisplay() {
  const ageStats = calculateAverageAge();
  
  const avgAgeElement = document.getElementById('average-age-display');
  if (avgAgeElement && ageStats.casualtyCount > 0) {
    avgAgeElement.innerHTML = `
      <div style="color: #00ff88; font-weight: bold; font-size: 16px; margin-bottom: 8px;">
        Promedio de Edad: ${ageStats.averageAge.toFixed(1)} años
      </div>
      <div style="color: #ffff00; font-size: 12px; margin-bottom: 4px;">
        Mediana: ${ageStats.medianAge.toFixed(1)} años
      </div>
      <div style="color: #ff6b6b; font-size: 12px; margin-bottom: 4px;">
        Rango: ${ageStats.minAge} - ${ageStats.maxAge} años
      </div>
      <div style="color: #74c0fc; font-size: 12px;">
        Bajas analizadas: ${ageStats.casualtyCount}
      </div>
    `;
  } else if (avgAgeElement) {
    avgAgeElement.innerHTML = `
      <div style="color: #999; font-size: 14px;">
        No hay datos en el rango seleccionado
      </div>
    `;
  }
}

function updateMarkersVisibility() {
  let totalVisible = 0;
  
  Object.entries(datasets).forEach(([key, dataset]) => {
    let visibleCount = 0;
    
    dataset.allMarkers.forEach(markerData => {
      const isInDateRange = isDateInRange(
        markerData.userData.F_Deceso, 
        dateRange.currentStart, 
        dateRange.currentEnd
      );
      
      const shouldBeVisible = dataset.visible && isInDateRange;
      
      markerData.marker.visible = shouldBeVisible;
      markerData.glowMarker.visible = shouldBeVisible;
      
      if (shouldBeVisible) {
        visibleCount++;
        totalVisible++;
      }
    });
    
    updateDatasetCount(key, dataset.allMarkers.length, visibleCount);
  });
  
  updateTotalCount(totalVisible);
  updateAgeDisplay(); 
  updateEventsPanel();
}

function updateEventsPanel() {
  const eventsContainer = document.getElementById('events-container');
  if (!eventsContainer) return;

  
  const filteredEvents = eventosData.filter(evento => {
    return isDateInRange(evento.fechaInicio, dateRange.currentStart, dateRange.currentEnd);
  });
  
  const sortedEvents = filteredEvents.sort((a, b) => {
    const dateA = parseDate(a.fechaInicio);
    const dateB = parseDate(b.fechaInicio);
    return dateA - dateB;
  });

  
  eventsContainer.innerHTML = '';

  if (sortedEvents.length === 0) {
    eventsContainer.innerHTML = '<div style="color: #999; font-size: 12px; padding: 10px;">No hay eventos en el rango seleccionado</div>';
    return;
  }
  
  sortedEvents.forEach(evento => {
    const eventDiv = document.createElement('div');
    eventDiv.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      margin: 5px 0;
      padding: 8px;
      border-radius: 5px;
      border-left: 3px solid #ffff00;
      font-size: 11px;
      line-height: 1.3;
      display: none;
    `;

    eventDiv.innerHTML = `
      <div style="font-weight: bold; color: #ffff00; margin-bottom: 3px;">
        ${formatDateForDisplay(parseDate(evento.fechaInicio))}
      </div>
      <div style="color: #fff; font-weight: bold; margin-bottom: 2px;">
        ${evento.evento}
      </div>
      <div style="color: #ccc; font-size: 10px; margin-bottom: 3px;">
        Tipo: ${evento.tipo}
      </div>
      <div style="color: #ddd; font-size: 10px;">
        ${evento.descripcion}
      </div>
      <div style="color: #ddd; font-size: 10px;">
        ${evento.bajas}
      </div>
    `;

    eventsContainer.appendChild(eventDiv);
  });
}

async function loadTextures() {
  return new Promise((resolve) => {
    let loadedCount = 0;
    const totalTextures = 2;
    
    const checkComplete = () => {
      loadedCount++;
      if (loadedCount === totalTextures) {
        resolve();
      }
    };
    
    textureLoader.load(
      'img/malvinas-terreno.jpg', 
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.flipY = false;
        textures.terrain = texture;
        console.log('Terrain texture loaded successfully');
        checkComplete();
      },
      undefined,
      (error) => {
        console.warn('Failed to load terrain texture:', error);
        checkComplete();
      }
    );
    
    textureLoader.load(
      'img/malvinas-mar.jpg', 
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 1); 
        texture.flipY = false;
        textures.water = texture;
        console.log('Water texture loaded successfully');
        checkComplete();
      },
      undefined,
      (error) => {
        console.warn('Failed to load water texture:', error);
        checkComplete();
      }
    );
  });
}

function latLonToXY(lat, lon, bounds) {
  const x = ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100 - 50;
  const y = ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100 - 50;
  return { x, y };
}

function calculateAge(fNac, fDeceso) {
  let normalizedFNac = convertISO8601ToDateString(fNac);
  let normalizedFDeceso = convertISO8601ToDateString(fDeceso);
  
  if (!normalizedFDeceso || normalizedFDeceso.toLowerCase().includes('sin fecha')) {
    normalizedFDeceso = '02/05/1982'; 
  }
  
  if (!normalizedFNac || !normalizedFDeceso) {
    return 20; 
  }
  
  try {
    const parseDate = (dateStr) => {
      const cleanStr = String(dateStr).trim();
      const [day, month, year] = cleanStr.split('/').map(num => parseInt(num));
      
      if (!day || !month || !year) {
        throw new Error(`Invalid date format: ${dateStr}`);
      }
      
      let fullYear;
      if (year < 100) {
        fullYear = year < 50 ? 1900 + year : 1900 + year;
        if (year > 50) fullYear = 1900 + year;
        else if (year < 30) fullYear = 1900 + year; 
        else fullYear = 1900 + year;
      } else {
        fullYear = year;
      }
      
      return new Date(fullYear, month - 1, day); 
    };
    
    const birthDate = parseDate(normalizedFNac);
    const deathDate = parseDate(normalizedFDeceso);
    
    let age = deathDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = deathDate.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && deathDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return Math.max(age, 16); 
    
  } catch (error) {
    console.warn('Error calculating age:', error, 'Birth:', normalizedFNac, 'Death:', normalizedFDeceso);
    return 20; 
  }
}

function ageToHeight(age) {
  const minHeight = 2;
  const maxHeight = 20;
  const minAge = 16;
  const maxAge = 76;
  
  const clampedAge = Math.max(minAge, Math.min(maxAge, age));
  const height = minHeight + ((clampedAge - minAge) / (maxAge - minAge)) * (maxHeight - minHeight);
  
  return height;
}

function calculateBounds(geojson) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  
  const processCoordinates = (coords) => {
    if (Array.isArray(coords[0])) {
      coords.forEach(processCoordinates);
    } else {
      const [lon, lat] = coords;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  };
  
  geojson.features.forEach(feature => {
    if (feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    } else if (feature.geometry.type === 'Polygon') {
      feature.geometry.coordinates.forEach(processCoordinates);
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach(polygon => {
        polygon.forEach(processCoordinates);
      });
    }
  });
  
  return { minLat, maxLat, minLon, maxLon };
}

function createIslandGeometry(geojson, bounds) {
  const group = new THREE.Group();
  
  geojson.features.forEach((feature, featureIndex) => {
    if (feature.geometry.type === 'Polygon') {
      createPolygonMesh(feature.geometry.coordinates, bounds, group, featureIndex);
    } else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach((polygon, polygonIndex) => {
        createPolygonMesh([polygon[0]], bounds, group, `${featureIndex}_${polygonIndex}`);
      });
    }
  });
  
  return group;
}

function createPolygonMesh(coordinates, bounds, group, id) {
  const shape = new THREE.Shape();
  const holes = [];
  
  coordinates.forEach((ring, ringIndex) => {
    const points = [];
    
    ring.forEach((coord, coordIndex) => {
      const pos = latLonToXY(coord[1], coord[0], bounds);
      points.push(new THREE.Vector2(pos.x, pos.y));
    });
    
    if (ringIndex === 0) {
      points.forEach((point, index) => {
        if (index === 0) {
          shape.moveTo(point.x, point.y);
        } else {
          shape.lineTo(point.x, point.y);
        }
      });
    } else {
      const hole = new THREE.Path();
      points.forEach((point, index) => {
        if (index === 0) {
          hole.moveTo(point.x, point.y);
        } else {
          hole.lineTo(point.x, point.y);
        }
      });
      holes.push(hole);
    }
  });
  
  shape.holes = holes;
  
  const extrudeSettings = {
    depth: ISLAND_HEIGHT,
    bevelEnabled: false
  };
  
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  
  
  if (textures.terrain) {
    const positions = geometry.attributes.position;
    const uvs = [];
    
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i); 
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      
      
      const u = (x + 50) / 100; 
      const v = (y + 50) / 100; 
      
      
      const clampedU = Math.max(0, Math.min(1, u));
      const clampedV = Math.max(0, Math.min(1, v));
      
      uvs.push(clampedU, clampedV);
    }
    
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  
  let terrainMaterial;
  if (textures.terrain) {
    terrainMaterial = new THREE.MeshLambertMaterial({ 
      map: textures.terrain,
      transparent: false,
      side: THREE.DoubleSide
    });
  } else {
    terrainMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x3a5f3a,
      transparent: false,
      side: THREE.DoubleSide
    });
  }
  
  const terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
  terrainMesh.rotation.x = -Math.PI / 2;
  terrainMesh.position.y = 0; 
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true; 
  terrainMesh.name = `terrain_${id}`;
  group.add(terrainMesh);
  
  
  const edgesGeometry = new THREE.EdgesGeometry(geometry);
  const edgesMaterial = new THREE.LineBasicMaterial({ 
    color: 0x2c3e50,
    linewidth: 1
  });
  const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
  edges.rotation.x = -Math.PI / 2;
  edges.position.y = 0.01;
  edges.name = `edges_${id}`;
  group.add(edges);
  
  
  if (coordinates.length === 1) { 
    createWaterPlane(bounds, group);
  }
}

function createWaterPlane(bounds, group) {
  const waterGeometry = new THREE.PlaneGeometry(480, 480, 32, 32);
  
  let waterMaterial;
  if (textures.water) {
    waterMaterial = new THREE.MeshLambertMaterial({
      map: textures.water,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
  } else {
    waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x006994,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });
  }
  
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  water.name = 'water';
  
  if (!group.getObjectByName('water')) {
    group.add(water);
  }
}

function createMarkers(geojson, color, datasetKey) {
  const group = new THREE.Group();
  
  if (!globalBounds) {
    return group;
  }
  
  let ageStats = { min: Infinity, max: -Infinity, total: 0, count: 0 };
  let positionDebug = [];
  
  geojson.features.forEach((feature, index) => {
    
    feature = normalizeFeatureDates(feature);
    
    if (feature.geometry && feature.geometry.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      const props = feature.properties || {};
      
      const age = calculateAge(props.F_Nac, props.F_Deceso);
      const height = ageToHeight(age);
      
      ageStats.min = Math.min(ageStats.min, age);
      ageStats.max = Math.max(ageStats.max, age);
      ageStats.total += age;
      ageStats.count++;
      
      const pos = latLonToXY(lat, lon, globalBounds);
      
      
      const geometry = new THREE.CylinderGeometry(0.1, 0.1, height, 8);
      const material = new THREE.MeshBasicMaterial({ 
        color: color,
        transparent: true,
        opacity: 0.4,
        emissive: color,           
        emissiveIntensity: 2.5     
      });
      
      const marker = new THREE.Mesh(geometry, material);
      
      marker.position.set(pos.x, ISLAND_HEIGHT + (height / 2), -pos.y);
      
      const glowGeometry = new THREE.CylinderGeometry(0.15, 0.15, height, 8);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.1,
        emissive: color,
        emissiveIntensity: 2,    
        side: THREE.DoubleSide
      });
      
      const glowMarker = new THREE.Mesh(glowGeometry, glowMaterial);
      glowMarker.position.set(pos.x, ISLAND_HEIGHT + (height / 2), -pos.y);
      
      group.add(glowMarker); 
      group.add(marker);     
      
      marker.userData = {
        ...props,
        age: age,
        height: height,
        originalCoords: { lat, lon },
        convertedPos: pos,
        isMarker: true,
        datasetName: group.name || 'unknown'
      };
      
      
      datasets[datasetKey].allMarkers.push({
        marker: marker,
        glowMarker: glowMarker,
        userData: marker.userData
      });
    }
  });
    
  if (ageStats.count > 0) {
    const avgAge = ageStats.total / ageStats.count;
  }
  
  return group;
}

async function loadGeoJSON(filename) {
  try {
    const response = await fetch(filename);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return null;
  }
}

async function loadEventosData() {
  try {
    const response = await fetch('eventosBelicos.json');
    if (!response.ok) {
      throw new Error('Failed to load eventosBelicos.json');
    }
    const data = await response.json();
    
    
    eventosData = data.map(evento => ({
      ...evento,
      fecha: convertISO8601ToDateString(evento.fechaInicio)
    }));
    
    console.log(`Loaded ${eventosData.length} war events`);
    return eventosData;
  } catch (error) {
    console.error('Error loading events data:', error);
    return [];
  }
}

async function init() {
  try {    
    
    await loadTextures();
    
    
    await loadEventosData();
    
    
    const malvinasData = await loadGeoJSON('./data/malvinas.geojson');
    if (malvinasData) {
      globalBounds = calculateBounds(malvinasData);
      console.log('Global bounds:', globalBounds);
      
      
      const islandGeometry = createIslandGeometry(malvinasData, globalBounds);
      malvinasGroup.add(islandGeometry);
      
      
      for (const [key, dataset] of Object.entries(datasets)) {
        console.log(`Loading dataset: ${dataset.name} (${dataset.file})`);
        const data = await loadGeoJSON(dataset.file);
        if (data && data.features) {
          console.log(`Processing ${data.features.length} features for ${dataset.name}`);
          const markers = createMarkers(data, dataset.color, key);
          dataset.group.add(markers);
          console.log(`Created ${dataset.allMarkers.length} markers for ${dataset.name}`);
        }
      }
      
      
      updateMarkersVisibility();
      
      
      camera.position.set(30, 60, 80);
      camera.lookAt(0, ISLAND_HEIGHT / 2, 0);
      controls.target.set(0, ISLAND_HEIGHT / 2, 0);
      controls.update();
            
    } else {
      console.error('Failed to load Malvinas geography data');
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

function updateDatasetCount(key, total, visible) {
  const label = document.querySelector(`label[for="toggle-${key}"]`);
  if (label) {
    const datasetName = datasets[key].name;
    label.textContent = `${datasetName} (${visible}/${total})`;
  }
}

function updateTotalCount(visible) {
  const totalElement = document.getElementById('total-count');
  if (totalElement) {
    const total = Object.values(datasets).reduce((sum, dataset) => sum + dataset.allMarkers.length, 0);
    totalElement.textContent = `Total visible: ${visible}/${total}`;
  }
}

function createUI() {
  const ui = document.createElement('div');
  ui.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    padding: 20px;
    border-radius: 10px;
    color: white;
    font-family: Arial, sans-serif;
    z-index: 1000;
    min-width: 250px;
    max-height: 80vh;
    overflow-y: auto;
    display: none;
  `;
  
  const title = document.createElement('h3');
  title.textContent = 'Fallecidos en Malvinas';
  title.style.cssText = 'margin: 0 0 15px 0; color: #ffffff; text-align: center;';
  ui.appendChild(title);
  
  
  const ageSection = document.createElement('div');
  ageSection.style.cssText = 'margin: 15px 0; padding: 15px; border: 2px solid #00ff88; border-radius: 8px; background: rgba(0, 255, 136, 0.1);';
  
  const ageDisplay = document.createElement('div');
  ageDisplay.id = 'average-age-display';
  ageDisplay.style.cssText = 'text-align: center;';
  
  ageSection.appendChild(ageDisplay);
  ui.appendChild(ageSection);
  
  
  const dateSection = document.createElement('div');
  dateSection.style.cssText = 'margin: 15px 0; padding: 15px 0; border-bottom: 1px solid #444;';
  
  const dateTitle = document.createElement('h4');
  dateTitle.textContent = 'Filtro por Fecha de Deceso';
  dateTitle.style.cssText = 'margin: 0 0 10px 0; color: #ffffff; font-size: 14px;';
  dateSection.appendChild(dateTitle);
  
  
  const startDateContainer = document.createElement('div');
  startDateContainer.style.cssText = 'margin: 10px 0;';
  
  const startDateLabel = document.createElement('label');
  startDateLabel.textContent = 'Desde: ';
  startDateLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #ccc;';
  
  const startDateValue = document.createElement('span');
  startDateValue.id = 'start-date-value';
  startDateValue.textContent = formatDateForDisplay(dateRange.currentStart);
  startDateValue.style.cssText = 'color: #00ff00; font-weight: bold;';
  startDateLabel.appendChild(startDateValue);
  
  const startDateSlider = document.createElement('input');
  startDateSlider.type = 'range';
  startDateSlider.min = '0';
  startDateSlider.max = String(Math.floor((dateRange.maxDate - dateRange.minDate) / (1000 * 60 * 60 * 24)));
  startDateSlider.value = '0';
  startDateSlider.style.cssText = 'width: 100%; margin: 5px 0;';
  
  startDateContainer.appendChild(startDateLabel);
  startDateContainer.appendChild(startDateSlider);
  dateSection.appendChild(startDateContainer);
  
  
  const endDateContainer = document.createElement('div');
  endDateContainer.style.cssText = 'margin: 10px 0;';
  
  const endDateLabel = document.createElement('label');
  endDateLabel.textContent = 'Hasta: ';
  endDateLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; color: #ccc;';
  
  const endDateValue = document.createElement('span');
  endDateValue.id = 'end-date-value';
  endDateValue.textContent = formatDateForDisplay(dateRange.currentEnd);
  endDateValue.style.cssText = 'color: #ff0000; font-weight: bold;';
  endDateLabel.appendChild(endDateValue);
  
  const endDateSlider = document.createElement('input');
  endDateSlider.type = 'range';
  endDateSlider.min = '0';
  endDateSlider.max = String(Math.floor((dateRange.maxDate - dateRange.minDate) / (1000 * 60 * 60 * 24)));
  endDateSlider.value = endDateSlider.max;
  endDateSlider.style.cssText = 'width: 100%; margin: 5px 0;';
  
  endDateContainer.appendChild(endDateLabel);
  endDateContainer.appendChild(endDateSlider);
  dateSection.appendChild(endDateContainer);
  
  
  startDateSlider.addEventListener('input', () => {
    const days = parseInt(startDateSlider.value);
    dateRange.currentStart = new Date(dateRange.minDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    
    if (dateRange.currentStart > dateRange.currentEnd) {
      dateRange.currentStart = new Date(dateRange.currentEnd);
      startDateSlider.value = String(Math.floor((dateRange.currentStart - dateRange.minDate) / (1000 * 60 * 60 * 24)));
    }
    
    startDateValue.textContent = formatDateForDisplay(dateRange.currentStart);
    updateMarkersVisibility();
  });
  
  endDateSlider.addEventListener('input', () => {
    const days = parseInt(endDateSlider.value);
    dateRange.currentEnd = new Date(dateRange.minDate.getTime() + days * 24 * 60 * 60 * 1000);
    
    
    if (dateRange.currentEnd < dateRange.currentStart) {
      dateRange.currentEnd = new Date(dateRange.currentStart);
      endDateSlider.value = String(Math.floor((dateRange.currentEnd - dateRange.minDate) / (1000 * 60 * 60 * 24)));
    }
    
    endDateValue.textContent = formatDateForDisplay(dateRange.currentEnd);
    updateMarkersVisibility();
  });
  
  ui.appendChild(dateSection);
  
  
  const datasetSection = document.createElement('div');
  datasetSection.style.cssText = 'margin: 15px 0; padding: 15px 0; border-bottom: 1px solid #444;';
  
  const datasetTitle = document.createElement('h4');
  datasetTitle.textContent = 'Datasets';
  datasetTitle.style.cssText = 'margin: 0 0 10px 0; color: #ffffff; font-size: 14px;';
  datasetSection.appendChild(datasetTitle);
  
  Object.entries(datasets).forEach(([key, dataset]) => {
    const container = document.createElement('div');
    container.style.cssText = 'margin: 10px 0; display: flex; align-items: center;';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = dataset.visible;
    checkbox.id = `toggle-${key}`;
    checkbox.style.cssText = 'margin-right: 10px; transform: scale(1.2);';
    
    const label = document.createElement('label');
    label.htmlFor = `toggle-${key}`;
    label.textContent = dataset.name;
    label.style.cssText = `color: #${dataset.color.toString(16).padStart(6, '0')}; cursor: pointer; font-weight: bold; font-size: 12px;`;
    
    checkbox.addEventListener('change', () => {
      dataset.visible = checkbox.checked;
      updateMarkersVisibility();
    });
    
    container.appendChild(checkbox);
    container.appendChild(label);
    datasetSection.appendChild(container);
  });
  
  ui.appendChild(datasetSection);
  
  
  const totalCount = document.createElement('div');
  totalCount.id = 'total-count';
  totalCount.style.cssText = 'margin: 10px 0; padding: 10px 0; border-top: 1px solid #444; font-weight: bold; color: #ffff00;';
  totalCount.textContent = 'Total visible: 0/0';
  ui.appendChild(totalCount);
  
  const stats = document.createElement('div');
  stats.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid #444; font-size: 12px;';
  stats.innerHTML = `
    <div style="margin: 5px 0;"><strong>Visualización 3D:</strong></div>
    <div style="margin: 2px 0; color: #ccc;">• Islas con altura uniforme (${ISLAND_HEIGHT} unidades)</div>
    <div style="margin: 2px 0; color: #ccc;">• Altura de cilindros = Edad al deceso</div>
    <div style="margin: 2px 0; color: #ccc;">• Marcadores sobre la superficie</div>
    <div style="margin: 2px 0; color: #ccc;">• Filtro temporal activo</div>
    <div style="margin: 2px 0; color: #ccc;">• Efecto bloom habilitado</div>
    <div style="margin: 2px 0; color: #ccc;">• Conversión automática de fechas ISO 8601</div>
    <div style="margin: 2px 0; color: #00ff88;">• Estadísticas de edad en tiempo real</div>
    <div style="margin: 5px 0;"><strong>Controles:</strong></div>
    <div style="margin: 2px 0; color: #ccc;">• Mouse: Rotar vista</div>
    <div style="margin: 2px 0; color: #ccc;">• Scroll: Zoom</div>
    <div style="margin: 2px 0; color: #ccc;">• Sliders: Filtrar fechas y ver cambios en edad promedio</div>
  `;
  ui.appendChild(stats);
  
  document.body.appendChild(ui);
}

function createEventsPanel() {
  const eventsPanel = document.createElement('div');
  eventsPanel.id = 'events-panel';
  eventsPanel.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    background: rgba(0,0,0,0.9);
    padding: 15px;
    border-radius: 10px;
    color: white;
    font-family: Arial, sans-serif;
    z-index: 1000;
    width: 300px;
    max-height: 80vh;
    overflow-y: auto;
    border: 1px solid #444;
    display: none;
  `;
  
  const title = document.createElement('h3');
  title.textContent = 'Eventos Bélicos';
  title.style.cssText = `
    margin: 0 0 15px 0; 
    color: #ffff00; 
    text-align: center;
    font-size: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #555;
  `;
  eventsPanel.appendChild(title);
  
  const eventsContainer = document.createElement('div');
  eventsContainer.id = 'events-container';
  eventsContainer.style.cssText = `
    max-height: calc(80vh - 100px);
    overflow-y: auto;
  `;
  
  eventsPanel.appendChild(eventsContainer);
  document.body.appendChild(eventsPanel);
}

function setupLighting() {
  const ambientLight = new THREE.AmbientLight(0x87ceeb, 0.15);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.2);
  
  directionalLight.position.set(100, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 4096;
  directionalLight.shadow.mapSize.height = 4096;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.left = -150;
  directionalLight.shadow.camera.right = 150;
  directionalLight.shadow.camera.top = 150;
  directionalLight.shadow.camera.bottom = -150;
  directionalLight.shadow.bias = -0.0001;
  scene.add(directionalLight);
  
  const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.3);
  fillLight.position.set(-50, 50, -50);
  scene.add(fillLight);
  
  const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5f3a, 0.4);
  scene.add(hemisphereLight);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  composer.render();
}

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let hoveredMarker = null;
let tooltip = null;

function createTooltip() {
  tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: fixed;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    pointer-events: none;
    z-index: 10000;
    display: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  `;
  document.body.appendChild(tooltip);
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const allMarkers = [];
  Object.values(datasets).forEach(dataset => {
    if (dataset.visible) {
      dataset.allMarkers.forEach(markerData => {
        if (markerData.marker.visible && 
            markerData.marker.geometry && 
            markerData.marker.geometry.type === 'CylinderGeometry' && 
            markerData.marker.userData && 
            typeof markerData.marker.userData.age === 'number') {
          allMarkers.push(markerData.marker);
        }
      });
    }
  });
  
  const intersects = raycaster.intersectObjects(allMarkers);
  
  if (intersects.length > 0) {
    const intersectedMarker = intersects[0].object;
    
    if (hoveredMarker !== intersectedMarker) {
      if (hoveredMarker) {
        hoveredMarker.material.opacity = 0.4;
        hoveredMarker.material.emissiveIntensity = 2.5;
      }
      
      hoveredMarker = intersectedMarker;
      hoveredMarker.material.opacity = 1.0;
      hoveredMarker.material.emissiveIntensity = 3.5; 
      
      const userData = hoveredMarker.userData;
      const age = userData.age;
      const name = userData.Nombre || userData.NOMBRE || userData.nombre || 'Sin nombre';
      const fNac = userData.F_Nac || 'Sin fecha';
      const fDeceso = userData.F_Deceso || 'Sin fecha';
      const LDeceso = userData.L_Deceso || 'Sin lugar';
      const Escalafon = userData.Escalafon || 'Sin escalafón';
      
      tooltip.innerHTML = `
        <strong>${name}</strong><br>
        Edad: ${age} años<br>
        <small>Nac: ${fNac} - Dec: ${fDeceso}</small><br>
        <small>Lugar: ${LDeceso}</small><br>
        <small>Escalafón: ${Escalafon}</small>
      `;
      tooltip.style.display = 'block';
      document.body.style.cursor = 'pointer';
    }
    
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
    
  } else {
    if (hoveredMarker) {
      hoveredMarker.material.opacity = 0.4;
      hoveredMarker.material.emissiveIntensity = 2.5;
      hoveredMarker = null;
      document.body.style.cursor = 'default';
    }
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

setupLighting();
createUI();
createEventsPanel();
createTooltip(); 
init();
animate();

window.addEventListener('mousemove', onMouseMove);

export { scene, camera, renderer, datasets, composer };