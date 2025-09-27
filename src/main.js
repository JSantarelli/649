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
  
  
  const averageValue = document.getElementById('average-value');
  const medianValue = document.getElementById('median-value');
  const minAgeElement = document.getElementById('min-age');
  const maxAgeElement = document.getElementById('max-age');
  const casualtyCountElement = document.getElementById('casualty-count');
  const ageStatsElements = document.querySelectorAll('#age-average, #age-median, #age-range, #age-count');
  const noDataElement = document.getElementById('age-no-data');
  
  if (ageStats.casualtyCount > 0) {
    
    ageStatsElements.forEach(el => el.style.display = 'block');
    if (noDataElement) noDataElement.style.display = 'none';
    
    
    if (averageValue) averageValue.textContent = ageStats.averageAge.toFixed(1);
    if (medianValue) medianValue.textContent = ageStats.medianAge.toFixed(1);
    if (minAgeElement) minAgeElement.textContent = ageStats.minAge;
    if (maxAgeElement) maxAgeElement.textContent = ageStats.maxAge;
    if (casualtyCountElement) casualtyCountElement.textContent = ageStats.casualtyCount;
  } else {
    
    ageStatsElements.forEach(el => el.style.display = 'none');
    if (noDataElement) noDataElement.style.display = 'block';
  }
}


function updateDatasetProgressBar(key, total, visible) {
  const container = document.querySelector(`[data-key="${key}"]`);
  if (!container) return;

  const progressBar = container.querySelector('.progress-bar');
  const progressPercent = container.querySelector('.progress-percent');
  const progressText = container.querySelector('.dataset__subfix');
  
  const percentage = total > 0 ? Math.round((visible / total) * 100) : 0;

  progressBar.style.width = `${percentage}%`;
  progressPercent.textContent = `${percentage}%`;
  progressText.innerHTML = `${visible}/<b>${total}</b>`;
  
  
  if (datasets[key].visible) {
    container.classList.remove('disabled');
  } else {
    container.classList.add('disabled');
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
    
    
    updateDatasetProgressBar(key, dataset.allMarkers.length, visibleCount);
  });
  
  updateTotalCount(totalVisible);
  updateAgeDisplay(); 
  updateEventsPanel();
  updateEscalafonDisplay();
}

function updateEventsPanel() {
  const eventsContainer = document.getElementById('events-panel');
  const template = document.getElementById('event-item-template');
  if (!eventsContainer || !template) return;

  // Clear any existing event highlights
  clearEventHighlights();

  const filteredEvents = eventosData.filter(evento => {
    return isDateInRange(evento.fechaInicio, dateRange.currentStart, dateRange.currentEnd);
  });
  
  const sortedEvents = filteredEvents.sort((a, b) => {
    const dateA = parseDate(a.fechaInicio);
    const dateB = parseDate(b.fechaInicio);
    return dateA - dateB;
  });

  eventsContainer.innerHTML = '<h3 class="ui__subtitle fixed">Eventos bélicos</h3>';

  if (sortedEvents.length === 0) {
    eventsContainer.innerHTML = '<div class="events-no-data">No hay eventos en el rango seleccionado</div>';
    return;
  }
  
  // Create event highlights on the map
  createEventHighlights(sortedEvents);
  
  sortedEvents.forEach(evento => {
    const eventElement = template.content.cloneNode(true);
    
    eventElement.querySelector('.event-date').textContent = formatDateForDisplay(parseDate(evento.fechaInicio));
    eventElement.querySelector('.event-title').textContent = evento.evento;
    eventElement.querySelector('.event-type').textContent = `Tipo: ${evento.tipo}`;
    eventElement.querySelector('.event-description').textContent = evento.descripcion;
    eventElement.querySelector('.event-casualties').textContent = evento.bajas;

    // Add click handler to highlight specific event location
    const eventItem = eventElement.querySelector('.event-item') || eventElement.children[0];
    if (eventItem && evento.coordinates) {
      eventItem.addEventListener('click', () => {
        highlightSpecificEvent(evento);
      });
      eventItem.style.cursor = 'pointer';
    }

    eventsContainer.appendChild(eventElement);
  });
}

// Global variable to store event highlights
let eventHighlights = new THREE.Group();

function createEventHighlights(events) {
  if (!globalBounds || !scene) return;
  
  events.forEach(evento => {
    if (!evento.coordinates) return;
    
    const [lon, lat] = evento.coordinates;
    const pos = latLonToXY(lat, lon, globalBounds);
    
    // Create highlight based on event type and casualties
    const highlight = createEventHighlight(evento, pos);
    eventHighlights.add(highlight);
  });
  
  scene.add(eventHighlights);
}

function createEventHighlight(evento, pos) {
  const group = new THREE.Group();
  
  // Determine color and size based on event type and casualties
  let color = 0xff4444;
  let baseRadius = 1.5;
  
  // Scale radius based on casualties (logarithmic scale for better visualization)
  const casualtyMultiplier = Math.log10(evento.bajas + 1) + 1;
  const radius = baseRadius * casualtyMultiplier;
  
  // Create main highlight circle
  const circleGeometry = new THREE.RingGeometry(radius * 0.8, radius, 32);
  const circleMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide
  });
  
  const circle = new THREE.Mesh(circleGeometry, circleMaterial);
  circle.position.set(pos.x, ISLAND_HEIGHT + 0.1, -pos.y);
  circle.rotation.x = -Math.PI / 2;
  
  // Create pulsing glow effect
  const glowGeometry = new THREE.RingGeometry(radius * 0.5, radius * 1.2, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide
  });
  
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.set(pos.x, ISLAND_HEIGHT + 0.05, -pos.y);
  glow.rotation.x = -Math.PI / 2;
  
  // Add userData for interaction
  circle.userData = {
    evento: evento,
    isEventHighlight: true
  };
  
  group.add(circle);
  group.add(glow);
  
  // Add subtle animation
  group.userData = {
    originalOpacity: circleMaterial.opacity,
    glowOpacity: glowMaterial.opacity,
    materials: [circleMaterial, glowMaterial],
    time: Math.random() * Math.PI * 2 // Random start phase
  };
  
  return group;
}

function clearEventHighlights() {
  if (eventHighlights && scene) {
    scene.remove(eventHighlights);
    
    // Dispose of geometries and materials
    eventHighlights.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    
    eventHighlights.clear();
  }
  
  eventHighlights = new THREE.Group();
}

function highlightSpecificEvent(evento) {
  if (!evento.coordinates || !globalBounds) return;
  
  const [lon, lat] = evento.coordinates;
  const pos = latLonToXY(lat, lon, globalBounds);
  
  // Create a temporary bright highlight
  const geometry = new THREE.RingGeometry(1.5, 2.5, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  
  const highlight = new THREE.Mesh(geometry, material);
  highlight.position.set(pos.x, ISLAND_HEIGHT + 0.2, -pos.y);
  highlight.rotation.x = -Math.PI / 2;
  
  scene.add(highlight);
  
  // Animate and remove after 2 seconds
  let opacity = 0.8;
  const fadeOut = () => {
    opacity -= 0.02;
    material.opacity = opacity;
    
    if (opacity > 0) {
      requestAnimationFrame(fadeOut);
    } else {
      scene.remove(highlight);
      geometry.dispose();
      material.dispose();
    }
  };
  
  setTimeout(fadeOut, 500);
}

// Optional: Add this to your animation loop to make event highlights pulse
function animateEventHighlights() {
  if (!eventHighlights) return;
  
  const time = Date.now() * 0.002;
  
  eventHighlights.children.forEach((group) => {
    if (group.userData && group.userData.materials) {
      const phase = group.userData.time + time;
      const pulse = Math.sin(phase) * 0.3 + 0.7; // Pulse between 0.4 and 1.0
      
      group.userData.materials.forEach((material, index) => {
        const baseOpacity = index === 0 ? group.userData.originalOpacity : group.userData.glowOpacity;
        material.opacity = baseOpacity * pulse;
      });
    }
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
    const response = await fetch('./data/eventosBelicos.json');
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


function updateTotalCount(visible) {
  const totalElement = document.getElementById('total-count');
  if (totalElement) {
    const total = Object.values(datasets).reduce((sum, dataset) => sum + dataset.allMarkers.length, 0);
    totalElement.textContent = `${visible}/${total}`;
  }
}


function setupUIEventListeners() {
  // Get DOM elements
  const startDateSlider = document.getElementById('start-date-slider');
  const endDateSlider = document.getElementById('end-date-slider');
  const startDateValue = document.getElementById('start-date-value');
  const endDateValue = document.getElementById('end-date-value');

  // Calculate max days for sliders
  const maxDays = Math.floor((dateRange.maxDate - dateRange.minDate) / (1000 * 60 * 60 * 24));
  
  // Set slider ranges
  if (startDateSlider && endDateSlider) {
    startDateSlider.max = String(maxDays);
    endDateSlider.max = String(maxDays);
    endDateSlider.value = String(maxDays);
  }

  // Date slider event listeners
  if (startDateSlider) {
    startDateSlider.addEventListener('input', () => {
      const days = parseInt(startDateSlider.value);
      dateRange.currentStart = new Date(dateRange.minDate.getTime() + days * 24 * 60 * 60 * 1000);
      
      if (dateRange.currentStart > dateRange.currentEnd) {
        dateRange.currentStart = new Date(dateRange.currentEnd);
        startDateSlider.value = String(Math.floor((dateRange.currentStart - dateRange.minDate) / (1000 * 60 * 60 * 24)));
      }
      
      if (startDateValue) {
        startDateValue.textContent = formatDateForDisplay(dateRange.currentStart);
      }
      updateMarkersVisibility();
    });
  }

  if (endDateSlider) {
    endDateSlider.addEventListener('input', () => {
      const days = parseInt(endDateSlider.value);
      dateRange.currentEnd = new Date(dateRange.minDate.getTime() + days * 24 * 60 * 60 * 1000);
      
      if (dateRange.currentEnd < dateRange.currentStart) {
        dateRange.currentEnd = new Date(dateRange.currentStart);
        endDateSlider.value = String(Math.floor((dateRange.currentEnd - dateRange.minDate) / (1000 * 60 * 60 * 24)));
      }
      
      if (endDateValue) {
        endDateValue.textContent = formatDateForDisplay(dateRange.currentEnd);
      }
      updateMarkersVisibility();
    });
  }

  document.querySelectorAll('.dataset-toggle').forEach(toggle => {
    toggle.addEventListener('click', function() {
      const key = this.getAttribute('data-toggle');
      const isActive = this.classList.contains('active');
      
      if (isActive) {
        this.classList.remove('active');
        datasets[key].visible = false;
      } else {
        this.classList.add('active');
        datasets[key].visible = true;
      }
      
      updateMarkersVisibility();
    });
  });

  // Initial date display update
  if (startDateValue) {
    startDateValue.textContent = formatDateForDisplay(dateRange.currentStart);
  }
  if (endDateValue) {
    endDateValue.textContent = formatDateForDisplay(dateRange.currentEnd);
  }

  // Initialize progress bars with current data
  Object.entries(datasets).forEach(([key, dataset]) => {
    updateDatasetProgressBar(key, dataset.allMarkers.length, 0);
  });
}

setupUIEventListeners();

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


const tooltip = document.getElementById('tooltip');

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
      
      if (tooltip) {
        tooltip.innerHTML = `
          <strong>${name}</strong><br>
          Edad: ${age} años<br>
          <small>Nac: ${fNac} - Dec: ${fDeceso}</small><br>
          <small>Lugar: ${LDeceso}</small><br>
          <small>Escalafón: ${Escalafon}</small>
        `;
        tooltip.style.display = 'block';
      }
      document.body.style.cursor = 'pointer';
    }
    
    if (tooltip) {
      tooltip.style.left = (event.clientX + 15) + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
    }
    
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



let escalafoneTracker = {
  counts: {},
  total: 0,
  visible: 0
};



function calculateEscalafonStats() {
  let escalafoneStats = {};
  let totalVisible = 0;
  
  Object.entries(datasets).forEach(([key, dataset]) => {
    if (dataset.visible) {
      dataset.allMarkers.forEach(markerData => {
        const isInDateRange = isDateInRange(
          markerData.userData.F_Deceso, 
          dateRange.currentStart, 
          dateRange.currentEnd
        );
        
        if (isInDateRange) {
          const escalafon = markerData.userData.Escalafon || 
                          markerData.userData.escalafon || 
                          markerData.userData.ESCALAFON || 
                          'Sin escalafón';
          
          const normalizedEscalafon = normalizeEscalafon(escalafon);
          
          if (!escalafoneStats[normalizedEscalafon]) {
            escalafoneStats[normalizedEscalafon] = 0;
          }
          escalafoneStats[normalizedEscalafon]++;
          totalVisible++;
        }
      });
    }
  });
  
  escalafoneTracker = {
    counts: escalafoneStats,
    total: totalVisible,
    visible: totalVisible
  };
  
  return escalafoneTracker;
}

function normalizeEscalafon(escalafon) {
  if (!escalafon || escalafon.toLowerCase().includes('sin escalafón') || 
      escalafon.toLowerCase().includes('sin escalafon') || 
      escalafon === '' || escalafon === 'N/A') {
    return 'Sin escalafón';
  }
  
  const normalized = escalafon.toString().trim();
  
  
  const rankMappings = {
    'Soldado': [
      'Soldado', 
      'Soldado Conscripto', 
      'Conscripto', 
      'Soldado Voluntario'
    ],
    'Cabo': [
      'Cabo', 
      'Cabo 1°', 
      'Cabo 1ro', 
      'Cabo Primero', 
      'Cabo Principal'
    ],
    'Sargento': [
      'Sargento', 
      'Sargento 1°', 
      'Sargento 1ro', 
      'Sargento Primero', 
      'Sargento Ayudante'
    ],
    'Oficial': [
      'Guardiamarina', 
      'Teniente de corbeta', 
      'Capitan de corbeta',
      'Capitán de Corbeta', 
      'Teniente de fragata', 
      'Capitan de fragata',
      'Capitán de Fragata', 
      'GENERAL DE BRIGADA',
      'CAPITÁN',
      'TENIENTE',
      'SUBTENIENTE',
      'TENIENTE 1º',
      '1ER. TENIENTE',
      'TENIENTE PRIMERO',
      'VICECOMODORO',
      'MAYOR',
      'ALFEREZ',
      'PRIMER ALFÉREZ',
      'General', 
      'General de Brigada', 
      'General de División'
    ],
    'Suboficial': [
      'Suboficial', 
      'Suboficial Mayor',
      'SUBOFICIAL PRIMERO',
      'SUBOFICIAL SEGUNDO',
      'SUBOFICIAL PRINCIPAL',
      'SUBOFICIAL AYUDANTE',
      'SUBOFICIAL AUXILIAR',
      'CABO',
      'CABO PRINCIPAL',
      'CABO 1RO.',
      'CABO 1º',
      'CABO PRIMERO',
      'CABO SEGUNDO',
      'CABO EN COMISIÓN',
      'SOLDADO CLASE 63',
      'MARINERO',
      'MARINERO PRIMERO',
      'SUBOFICIAL PRIMERO',
      'SUBOFICIAL SEGUNDO',
      'SARGENTO',
      'SARGENTO AYUDANTE',
      'SARGENTO PRIMERO'
    ],
    'Civil': ['Civil', 'Piloto Civil', 'Tripulante Civil']
  };
  
  for (const [mainRank, variants] of Object.entries(rankMappings)) {
    if (variants.some(variant => normalized.toLowerCase().includes(variant.toLowerCase()))) {
      return mainRank;
    }
  }
  
  return normalized;
}

function updateEscalafonDisplay() {
  const escalafoneStats = calculateEscalafonStats();
  const escalafoneContainer = document.getElementById('escalafone-container');
  
  if (!escalafoneContainer) return;
  
  
  escalafoneContainer.innerHTML = '';
  
  if (escalafoneStats.total === 0) {
    escalafoneContainer.innerHTML = '<div class="escalafone-no-data">No hay datos de escalafón en el rango seleccionado</div>';
    return;
  }
  
  
  const sortedEscalafones = Object.entries(escalafoneStats.counts)
    .sort(([,a], [,b]) => b - a)
    .filter(([,count]) => count > 0);
  
  sortedEscalafones.forEach(([escalafon, count], index) => {
    const percentage = escalafoneStats.total > 0 ? (count / escalafoneStats.total) * 100 : 0;
    
    const escalafoneDiv = document.createElement('div');
    escalafoneDiv.className = 'escalafone-item';
    
    const colorClass = getEscalafonColorClass(escalafon, index);
    
    escalafoneDiv.innerHTML = `
      <div class="escalafone-container ${colorClass}" data-escalafon="${escalafon}">
        <div class="escalafone-info">
          <div class="escalafone-label">${escalafon}</div>
          <div class="escalafone-count">${count} (${percentage.toFixed(1)}%)</div>
        </div>
        <div class="escalafone-progress-bar-container">
          <div class="escalafone-progress-bar" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
    
    escalafoneContainer.appendChild(escalafoneDiv);
  });
}

function getEscalafonColorClass(escalafon, index) {
  const colorClasses = {
    'General': 'escalafon-general',
    'Coronel': 'escalafon-coronel',
    'Teniente Coronel': 'escalafon-teniente-coronel',
    'Mayor': 'escalafon-mayor',
    'Capitán': 'escalafon-capitan',
    'Teniente': 'escalafon-teniente',
    'Suboficial': 'escalafon-suboficial',
    'Sargento': 'escalafon-sargento',
    'Cabo': 'escalafon-cabo',
    'Soldado': 'escalafon-soldado',
    'Marinero': 'escalafon-marinero',
    'Aviador': 'escalafon-aviador',
    'Civil': 'escalafon-civil',
    'Sin escalafón': 'escalafon-sin-escalafon'
  };
  
  return colorClasses[escalafon] || `escalafon-other-${index % 6}`;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}


window.addEventListener('resize', onWindowResize);
window.addEventListener('mousemove', onMouseMove);


setupLighting();
init();
animate();

export { scene, camera, renderer, datasets, composer };