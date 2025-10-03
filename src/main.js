import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c3e50);

const camera = new THREE.PerspectiveCamera(
  35,
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
}

let eventHighlights = new THREE.Group();
let currentSelectedEvent = null;

function updateEventsPanel() {
  const eventsContainer = document.getElementById('events-panel');
  const template = document.getElementById('event-item-template');
  if (!eventsContainer || !template) return;

  
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
  
  
  createEventHighlights(sortedEvents);
  
  sortedEvents.forEach(evento => {
    const eventElement = template.content.cloneNode(true);
    
    eventElement.querySelector('.event-date').textContent = formatDateForDisplay(parseDate(evento.fechaInicio));
    eventElement.querySelector('.event-title').textContent = evento.evento;
    eventElement.querySelector('.event-type').textContent = `Tipo: ${evento.tipo}`;
    eventElement.querySelector('.event-description').textContent = evento.descripcion;
    eventElement.querySelector('.event-casualties').textContent = evento.bajas;

    
    const eventItem = eventElement.querySelector('.event-item') || eventElement.children[0];
    if (eventItem && evento.coordinates) {
      eventItem.addEventListener('click', () => {
        
        const isCurrentlyActive = eventItem.classList.contains('active');
        
        
        const allEventItems = eventsContainer.querySelectorAll('.event-item');
        allEventItems.forEach(item => item.classList.remove('active'));
        
        if (isCurrentlyActive) {
          
          currentSelectedEvent = null;
          updateEventHighlightStates();
          returnToOverview();
        } else {
          
          currentSelectedEvent = evento;
          eventItem.classList.add('active');
          updateEventHighlightStates();
          highlightSpecificEvent(evento);
        }
      });
      eventItem.style.cursor = 'pointer';
    }

    eventsContainer.appendChild(eventElement);
  });
}
let hoveredEvent = null;
let clickedEventTooltip = false;
let clickedEvent = null;

function createEventHighlights(events) {
  if (!globalBounds || !scene) return;
  
  events.forEach(evento => {
    if (!evento.coordinates) return;
    
    const [lon, lat] = evento.coordinates;
    const pos = latLonToXY(lat, lon, globalBounds);
    
    
    const highlight = createEventHighlight(evento, pos);
    eventHighlights.add(highlight);
  });
  
  scene.add(eventHighlights);
}

function createEventHighlight(evento, pos) {
  const group = new THREE.Group();
  
  let color = 0xff4444;
  let baseRadius = 1.5;
  
  const casualtyMultiplier = Math.log10(evento.bajas + 1) + 1;
  const radius = baseRadius * casualtyMultiplier;
  
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
  
  
  circle.userData = {
    evento: evento,
    isEventHighlight: true,
    eventGroup: group
  };
  
  glow.userData = {
    evento: evento,
    isEventHighlight: true,
    eventGroup: group
  };
  
  group.add(circle);
  group.add(glow);
  
  group.userData = {
    evento: evento,
    originalOpacity: circleMaterial.opacity,
    glowOpacity: glowMaterial.opacity,
    dimmedOpacity: 0.15, 
    dimmedGlowOpacity: 0.05, 
    materials: [circleMaterial, glowMaterial],
    time: Math.random() * Math.PI * 2,
    circle: circle,
    glow: glow
  };
  
  return group;
}


function updateEventHighlightStates() {
  if (!eventHighlights) return;
  
  eventHighlights.traverse((child) => {
    if (child.userData && child.userData.evento && child.userData.materials) {
      const isSelected = currentSelectedEvent && 
                        child.userData.evento.evento === currentSelectedEvent.evento &&
                        child.userData.evento.fechaInicio === currentSelectedEvent.fechaInicio;
      
      const [circleMaterial, glowMaterial] = child.userData.materials;
      
      if (currentSelectedEvent === null) {
        circleMaterial.opacity = child.userData.originalOpacity;
        glowMaterial.opacity = child.userData.glowOpacity;
      } else if (isSelected) {
        circleMaterial.opacity = child.userData.originalOpacity * 1.2; 
        glowMaterial.opacity = child.userData.glowOpacity * 1.5;
      } else {
        circleMaterial.opacity = child.userData.dimmedOpacity;
        glowMaterial.opacity = child.userData.dimmedGlowOpacity;
      }
    }
  });
}


function clearEventHighlights() {
  if (eventHighlights && scene) {
    scene.remove(eventHighlights);
    
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
  currentSelectedEvent = null;
  
  
  hoveredEvent = null;
  clickedEventTooltip = false;
  clickedEvent = null;
}

function highlightSpecificEvent(evento) {
  if (!evento.coordinates || !globalBounds || !camera || !controls) return;
  
  const [lon, lat] = evento.coordinates;
  const pos = latLonToXY(lat, lon, globalBounds);
  
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
  
  zoomToEvent(pos, evento);
  
  
  setTimeout(() => {
    
    const worldPosition = new THREE.Vector3(pos.x, ISLAND_HEIGHT + 0.2, -pos.y);
    const screenPosition = worldPosition.clone();
    screenPosition.project(camera);
    
    
    const screenX = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (screenPosition.y * -0.5 + 0.5) * window.innerHeight;
    
    
    const fakeEvent = {
      clientX: screenX + 20,
      clientY: screenY - 20
    };
    
    showEventTooltip(evento, fakeEvent, true);
  }, 1600); 
  
  let opacity = 0.8;
  const fadeOut = () => {
    opacity -= 0.01;
    material.opacity = opacity;
    
    if (opacity > 0) {
      requestAnimationFrame(fadeOut);
    } else {
      scene.remove(highlight);
      geometry.dispose();
      material.dispose();
    }
  };
  
  setTimeout(fadeOut, 1000); 
}

function zoomToEvent(eventPos, evento) {
  if (!camera || !controls) return;
  
  
  const currentPosition = camera.position.clone();
  const currentTarget = controls.target.clone();
  
  
  let zoomDistance;
  switch (evento.tipo) {
    case 'Batalla':
      zoomDistance = 8; 
      break;
    case 'Operación':
      zoomDistance = 12; 
      break;
    case 'Ataque aéreo':
    case 'Ataque naval':
    case 'Operación submarina':
      zoomDistance = 10; 
      break;
    default:
      zoomDistance = 15; 
  }
  
  
  const targetPosition = new THREE.Vector3(
    eventPos.x,
    ISLAND_HEIGHT + zoomDistance,
    -eventPos.y + zoomDistance * 0.7
  );
  
  const targetLookAt = new THREE.Vector3(
    eventPos.x,
    ISLAND_HEIGHT,
    -eventPos.y
  );
  
  animateCameraToPosition(targetPosition, targetLookAt, 1500); 
}

function animateCameraToPosition(targetPos, targetLookAt, duration = 1000) {
  if (!camera || !controls) return;
  
  const startPos = camera.position.clone();
  const startLookAt = controls.target.clone();
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    
    const eased = progress < 0.5 
      ? 4 * progress * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    
    
    camera.position.lerpVectors(startPos, targetPos, eased);
    
    
    const currentLookAt = new THREE.Vector3().lerpVectors(startLookAt, targetLookAt, eased);
    controls.target.copy(currentLookAt);
    
    
    controls.update();
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  
  animate();
}

function returnToOverview() {
  if (!camera || !controls) return;
  
  
  const overviewPosition = new THREE.Vector3(30, 60, 80);
  const overviewTarget = new THREE.Vector3(0, ISLAND_HEIGHT / 2, 0);
  
  animateCameraToPosition(overviewPosition, overviewTarget, 2000);
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
      
      camera.position.set(24, 48, 120);
      camera.lookAt(0, ISLAND_HEIGHT / 2, 0);
      controls.target.set(0, ISLAND_HEIGHT / 2, 0);
      controls.update();
            
    } else {
      console.error('Failed to load Malvinas geography data');
    }
  } catch (error) {
    console.error('Initialization error:', error);
  }

  soldierSearch.populateBirthPlaceDropdown();
}

function updateTotalCount(visible) {
  const totalElement = document.getElementById('total-count');
  if (totalElement) {
    const total = Object.values(datasets).reduce((sum, dataset) => sum + dataset.allMarkers.length, 0);
    totalElement.textContent = `${visible}/${total}`;
  }
}

function setupUIEventListeners() {
  
  const startDateSlider = document.getElementById('start-date-slider');
  const endDateSlider = document.getElementById('end-date-slider');
  const startDateValue = document.getElementById('start-date-value');
  const endDateValue = document.getElementById('end-date-value');

  const maxDays = Math.floor((dateRange.maxDate - dateRange.minDate) / (1000 * 60 * 60 * 24));
  
  if (startDateSlider && endDateSlider) {
    startDateSlider.max = String(maxDays);
    endDateSlider.max = String(maxDays);
    endDateSlider.value = String(maxDays);
  }

  
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

  
  if (startDateValue) {
    startDateValue.textContent = formatDateForDisplay(dateRange.currentStart);
  }
  if (endDateValue) {
    endDateValue.textContent = formatDateForDisplay(dateRange.currentEnd);
  }

  
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


let clickedTooltip = false;
let clickedMarker = null;

function onMouseMove(event, isClick = false) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const allMarkers = [];
  const allEventHighlights = [];
  
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
  
  if (eventHighlights) {
    eventHighlights.traverse((child) => {
      if (child.userData && child.userData.isEventHighlight) {
        allEventHighlights.push(child);
      }
    });
  }
  
  const allInteractiveObjects = [...allMarkers, ...allEventHighlights];
  const intersects = raycaster.intersectObjects(allInteractiveObjects);
  
  if (intersects.length > 0) {
    const intersectedObject = intersects[0].object;
    
    
    if (intersectedObject.userData.isEventHighlight) {
      handleEventInteraction(intersectedObject, event, isClick);
    }
    
    else {
      handleMarkerInteraction(intersectedObject, event, isClick);
    }
    
  } else {
    
    if (isClick) {
      dismissEventTooltip();
      dismissTooltip(); 
      return;
    }
    
    
    resetHoverStates();
  }
}
  
  if (clickedEvent) {
    resetEventHighlight(clickedEvent);
    clickedEvent = null;
  }
  
  
  if (tooltip) {
    tooltip.style.display = 'none';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
    tooltip.style.backgroundColor = '#ffffff';
  }

function handleEventInteraction(intersectedObject, event, isClick) {
  const eventObj = intersectedObject.userData.evento;
  const eventGroup = intersectedObject.userData.eventGroup;
  
  if (isClick) {
    
    if (clickedEvent && clickedEvent !== eventGroup) {
      resetEventHighlight(clickedEvent);
    }
    
    
    clickedEvent = eventGroup;
    highlightEventGroup(eventGroup, true);
    
    
    clickedEventTooltip = true;
    showEventTooltip(eventObj, event, true);
    return;
  }
  
  if (clickedEventTooltip && clickedEvent === eventGroup) {
    
    if (tooltip) {
      tooltip.style.left = (event.clientX + 15) + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
    }
    return;
  }
  
  if (hoveredEvent !== eventGroup) {
    
    if (hoveredEvent && hoveredEvent !== clickedEvent) {
      resetEventHighlight(hoveredEvent);
    }
    
    hoveredEvent = eventGroup;
    
    
    if (hoveredEvent !== clickedEvent) {
      highlightEventGroup(eventGroup, false);
    }
    
    
    if (!clickedEventTooltip) {
      showEventTooltip(eventObj, event, false);
    }
    
    document.body.style.cursor = 'pointer';
  }
  
  
  if (tooltip && !clickedEventTooltip) {
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  }
}

function handleMarkerInteraction(intersectedObject, event, isClick) {
  
  if (isClick) {
    
    if (clickedMarker && clickedMarker !== intersectedObject) {
      clickedMarker.material.opacity = 0.4;
      clickedMarker.material.emissiveIntensity = 2.5;
    }
    
    
    clickedMarker = intersectedObject;
    clickedMarker.material.opacity = 1.0;
    clickedMarker.material.emissiveIntensity = 3.5;
    
    
    clickedTooltip = true;
    showTooltip(clickedMarker, event, true);
    return;
  }
  
  
  if (clickedTooltip && clickedMarker === intersectedObject) {
    
    if (tooltip) {
      tooltip.style.left = (event.clientX + 15) + 'px';
      tooltip.style.top = (event.clientY - 10) + 'px';
    }
    return;
  }
  
  if (hoveredMarker !== intersectedObject) {
    
    if (hoveredMarker && hoveredMarker !== clickedMarker) {
      hoveredMarker.material.opacity = 0.4;
      hoveredMarker.material.emissiveIntensity = 2.5;
    }
    
    hoveredMarker = intersectedObject;
    
    
    if (hoveredMarker !== clickedMarker) {
      hoveredMarker.material.opacity = 1.0;
      hoveredMarker.material.emissiveIntensity = 3.5;
    }  
    
    if (!clickedTooltip) {
      showTooltip(hoveredMarker, event);
    }
    
    document.body.style.cursor = 'pointer';
  }
  
  if (tooltip && !clickedTooltip) {
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  }
}

function resetHoverStates() {
  
  if (!clickedTooltip && !clickedEventTooltip) {
    if (hoveredMarker) {
      hoveredMarker.material.opacity = 0.4;
      hoveredMarker.material.emissiveIntensity = 2.5;
      hoveredMarker = null;
    }
    
    if (hoveredEvent) {
      resetEventHighlight(hoveredEvent);
      hoveredEvent = null;
    }
    
    document.body.style.cursor = 'default';
    
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  } else {
    
    if (hoveredMarker && hoveredMarker !== clickedMarker) {
      hoveredMarker.material.opacity = 0.4;
      hoveredMarker.material.emissiveIntensity = 2.5;
    }
    if (hoveredEvent && hoveredEvent !== clickedEvent) {
      resetEventHighlight(hoveredEvent);
    }
    hoveredMarker = null;
    hoveredEvent = null;
    document.body.style.cursor = 'default';
  }
}

function highlightEventGroup(eventGroup, isClicked) {
  if (!eventGroup || !eventGroup.userData.materials) return;
  
  const [circleMaterial, glowMaterial] = eventGroup.userData.materials;
  const multiplier = isClicked ? 1.5 : 1.2;
  
  circleMaterial.opacity = eventGroup.userData.originalOpacity * multiplier;
  glowMaterial.opacity = eventGroup.userData.glowOpacity * multiplier;
}

function resetEventHighlight(eventGroup) {
  if (!eventGroup || !eventGroup.userData.materials) return;
  
  const [circleMaterial, glowMaterial] = eventGroup.userData.materials;
  
  circleMaterial.opacity = eventGroup.userData.originalOpacity;
  glowMaterial.opacity = eventGroup.userData.glowOpacity;
}

function getEventIcon(tipo) {
  const iconMap = {
    'Batalla': 'fa fa-crossed-swords',
    'Operación': 'fa fa-chess-knight',
    'Ataque aéreo': 'fa fa-fighter-jet',
    'Ataque naval': 'fa fa-ship',
    'Operación submarina': 'fa fa-submarine',
    'Bombardeo': 'fa fa-bomb',
    'Reconocimiento': 'fa fa-binoculars',
    'Desembarco': 'fa fa-anchor'
  };

  return iconMap[tipo] || 'fas fa-map-marker-alt';
}

function showEventTooltip(evento, event, isPinned = false) {
  if (!tooltip) return;
  
  const formattedDate = formatDateForDisplay(parseDate(evento.fechaInicio));
  const eventIcon = getEventIcon(evento.tipo);
  
  tooltip.innerHTML = `
    ${isPinned ? '<button class="tooltip-close" onclick="dismissEventTooltip()" style="position: absolute; top: 5px; right: 8px; background: none; border: none; font-size: 16px; cursor: pointer; color: #666; font-weight: bold; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">&times;</button>' : ''}
    <div style="${isPinned ? 'padding-right: 25px;' : ''}">
      <strong>${evento.evento}</strong><br>
      <small><em><i class="${eventIcon}" style="margin-right: 6px;"></i>${evento.tipo}</em></small><br>
      <small><strong>Fecha:</strong> ${formattedDate}</small><br>
      <small><strong>Bajas:</strong> ${evento.bajas}</small><br>
      <div style="margin-top: 8px; font-size: 12px; max-width: 250px;">
        ${evento.descripcion}
      </div>
    </div>
  `;
  
  tooltip.style.display = 'block';
  tooltip.style.left = (event.clientX + 15) + 'px';
  tooltip.style.top = (event.clientY - 10) + 'px';
  
  
  if (isPinned) {
    tooltip.style.border = '2px solid #ff4444';
    tooltip.style.boxShadow = '0 4px 12px rgba(255,68,68,0.3)';
    tooltip.style.backgroundColor = '#171717ff';
  } else {
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
    tooltip.style.backgroundColor = '#434141ff';
  }
}

function showTooltip(marker, event, isPinned = false) {
  const userData = marker.userData;
  const age = userData.age;
  const name = userData.Nombre || userData.NOMBRE || userData.nombre || 'Sin nombre';
  const fNac = userData.F_Nac || 'Sin fecha';
  const fDeceso = userData.F_Deceso || 'Sin fecha';
  const LDeceso = userData.L_Deceso || 'Lugar no esepcificaad';
  const Escalafon = userData.Escalafon || 'Sin escalafón';
  const LNac = userData.L_Nac || 'Lugar no esepcificaado';
  const img = userData.Foto || 'https://static.vecteezy.com/system/resources/previews/050/562/695/non_2x/soldier-helmet-with-head-icon-silhouette-on-white-background-vector.jpg';
  const informe = userData.PDF;
  
  if (tooltip) {
    tooltip.innerHTML = `
      <div class="card__wrapper">
        <img src="${img}" class="card__img">
        <article class="card__body">
          <header class="card__header">
            <strong class="card__title">${name}</strong>
            ${isPinned ? '<button class="card__icon--close" onclick="dismissTooltip()">&times</button>' : ''}
          </header>
          <p class="card__subtitle">Edad: ${age} años</p>
          <small class="card__text">Nac: ${fNac} - Dec: ${fDeceso}</small>
          <small class="card__text">Escalafón: ${Escalafon}</small>
          <small class="card__text">Lugar de nacimiento: ${LNac}</small>
          <small class="card__text">Lugar de defunción: ${LDeceso}</small>
          <button> 
            <a href="${informe}} target="_blank"></a>
            Conocer más
          </button>
        </article>
      </div>
    `;
    tooltip.style.display = 'block';
    tooltip.style.left = (event.clientX + 15) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
    
    
    if (isPinned) {
      tooltip.style.border = '2px solid #007acc';
      tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      tooltip.style.backgroundColor = '#232323ff';
    } else {
      tooltip.style.border = '1px solid #ccc';
      tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      tooltip.style.backgroundColor = '#1c1c1cff';
    }
  }
}

function onClick(event) {
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
    
    
    if (clickedMarker && clickedMarker !== intersectedMarker) {
      clickedMarker.material.opacity = 0.4;
      clickedMarker.material.emissiveIntensity = 2.5;
    }
    
    
    clickedMarker = intersectedMarker;
    clickedMarker.material.opacity = 1.0;
    clickedMarker.material.emissiveIntensity = 3.5;
    
    
    clickedTooltip = true;
    showTooltip(clickedMarker, event, true);
  } else {
    
    dismissTooltip();
  }
}

function dismissTooltip() {
  clickedTooltip = false;
  
  
  if (clickedMarker) {
    clickedMarker.material.opacity = 0.4;
    clickedMarker.material.emissiveIntensity = 2.5;
    clickedMarker = null;
  }
  
  
  if (tooltip) {
    tooltip.style.display = 'none';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  }
}

class SoldierSearch {
    constructor(datasets) {
        this.datasets = datasets;
        this.searchResults = [];
        this.currentBirthPlaceFilter = ''; 
        this.setupSearchUI();
    }
    
    extractName(userData) {
        return userData.Nombre || userData.NOMBRE || userData.nombre || 'Sin nombre';
    }
    
    
    getUniqueBirthPlaces() {
        const places = new Set();
        
        Object.values(this.datasets).forEach(dataset => {
            if (dataset.allMarkers && Array.isArray(dataset.allMarkers)) {
                dataset.allMarkers.forEach(markerData => {
                    if (markerData.marker && markerData.marker.userData) {
                        const lNac = markerData.marker.userData.L_Nac;
                        if (lNac && lNac.trim() !== '' && lNac !== 'Lugar no especificado') {
                            places.add(lNac.trim());
                        }
                    }
                });
            }
        });
        
        return Array.from(places).sort();
    }
    
    
    populateBirthPlaceDropdown() {
        const dropdown = document.getElementById('birthplace-filter');
        if (!dropdown) return;
        
        dropdown.innerHTML = '';
        
        const allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = 'Todos los lugares';
        dropdown.appendChild(allOption);
        
        const uniquePlaces = this.getUniqueBirthPlaces();
        console.log('Found unique birth places:', uniquePlaces); 
        
        uniquePlaces.forEach(place => {
            const option = document.createElement('option');
            option.value = place;
            option.textContent = place;
            dropdown.appendChild(option);
        });
        
        console.log(`Populated dropdown with ${uniquePlaces.length} birth places`);
    }
    
    
    filterMarkersByBirthPlace(birthPlace) {
        this.currentBirthPlaceFilter = birthPlace;
        
        let hiddenCount = 0;
        let shownCount = 0;
        
        Object.values(this.datasets).forEach(dataset => {
            if (dataset.allMarkers && Array.isArray(dataset.allMarkers)) {
                dataset.allMarkers.forEach(markerData => {
                    const marker = markerData.marker;
                    
                    if (marker && marker.userData) {
                        const lNac = (marker.userData.L_Nac || '').trim();
                        
                        if (!birthPlace || lNac === birthPlace) {
                            marker.visible = true;
                            
                            if (window.scene && marker.parent !== window.scene) {
                                window.scene.add(marker);
                            }
                            shownCount++;
                        } else {
                            marker.visible = false;
                            
                            if (window.scene && marker.parent === window.scene) {
                                window.scene.remove(marker);
                            }
                            hiddenCount++;
                        }
                    }
                });
            }
        });
        
        console.log(`Filter applied: ${shownCount} markers shown, ${hiddenCount} markers hidden`);
        
        // Clear search input when filtering by birthplace
        const searchInput = document.getElementById('soldier-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // List all soldiers from the selected birthplace
        if (birthPlace) {
            this.listSoldiersByBirthPlace(birthPlace);
        } else {
            // Clear results when showing all places
            this.updateSearchResults([], '');
        }
        
        this.updateFilterStats();
    }
    
    
    listSoldiersByBirthPlace(birthPlace) {
        const results = [];
        
        Object.entries(this.datasets).forEach(([datasetKey, dataset]) => {
            if (dataset.allMarkers && Array.isArray(dataset.allMarkers)) {
                dataset.allMarkers.forEach((markerData, index) => {
                    if (markerData.marker && 
                        markerData.marker.userData && 
                        typeof markerData.marker.userData.age === 'number') {
                        
                        const userData = markerData.marker.userData;
                        const lNac = (userData.L_Nac || '').trim();
                        
                        if (lNac === birthPlace) {
                            const name = this.extractName(userData);
                            
                            if (name !== 'Sin nombre') {
                                let coordinates = null;
                                
                                if (markerData.coordinates) {
                                    coordinates = markerData.coordinates;
                                } else if (userData.coordinates) {
                                    coordinates = userData.coordinates;
                                } else if (userData.lat && userData.lon) {
                                    coordinates = [userData.lon, userData.lat];
                                } else {
                                    coordinates = this.extractCoordinatesFromUserData(userData);
                                }
                                
                                results.push({
                                    name: name,
                                    dataset: dataset.name,
                                    datasetKey: datasetKey,
                                    marker: markerData.marker,
                                    markerData: markerData,
                                    markerIndex: index,
                                    userData: userData,
                                    coordinates: coordinates,
                                    color: dataset.color
                                });
                            }
                        }
                    }
                });
            }
        });
        
        results.sort((a, b) => a.name.localeCompare(b.name));
        
        this.searchResults = results;
        this.updateSearchResults(results, birthPlace, true);
        return results;
    }
    
    
    updateFilterStats() {
        const filterStats = document.getElementById('filter-stats');
        if (!filterStats) return;
        
        let visibleCount = 0;
        let totalCount = 0;
        
        Object.values(this.datasets).forEach(dataset => {
            if (dataset.allMarkers && Array.isArray(dataset.allMarkers)) {
                dataset.allMarkers.forEach(markerData => {
                    if (markerData.marker && markerData.marker.userData && 
                        typeof markerData.marker.userData.age === 'number') {
                        totalCount++;
                        if (markerData.marker.visible) {
                            visibleCount++;
                        }
                    }
                });
            }
        });
        
        if (this.currentBirthPlaceFilter) {
            filterStats.textContent = `Mostrando ${visibleCount} de ${totalCount} soldados`;
            filterStats.style.display = 'block';
        } else {
            filterStats.style.display = 'none';
        }
    }
    
    searchByName(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return [];
        }

        const results = [];
        const normalizedSearch = searchTerm.toLowerCase().trim();

        Object.entries(this.datasets).forEach(([datasetKey, dataset]) => {
            if (dataset.allMarkers && Array.isArray(dataset.allMarkers)) {
                dataset.allMarkers.forEach((markerData, index) => {
                    if (markerData.marker && 
                        markerData.marker.userData && 
                        typeof markerData.marker.userData.age === 'number') {
                        
                        const userData = markerData.marker.userData;
                        const name = this.extractName(userData);
                        
                        const lNac = (userData.L_Nac || '').trim();
                        const matchesBirthPlace = !this.currentBirthPlaceFilter || 
                                                 lNac === this.currentBirthPlaceFilter;
                        
                        if (name !== 'Sin nombre' && matchesBirthPlace) {
                            const normalizedName = name.toLowerCase();
                            
                            if (normalizedName.includes(normalizedSearch)) {
                                let coordinates = null;
                                
                                if (markerData.coordinates) {
                                    coordinates = markerData.coordinates;
                                } else if (userData.coordinates) {
                                    coordinates = userData.coordinates;
                                } else if (userData.lat && userData.lon) {
                                    coordinates = [userData.lon, userData.lat];
                                } else {
                                    coordinates = this.extractCoordinatesFromUserData(userData);
                                }
                                
                                results.push({
                                    name: name,
                                    dataset: dataset.name,
                                    datasetKey: datasetKey,
                                    marker: markerData.marker,
                                    markerData: markerData,
                                    markerIndex: index,
                                    userData: userData,
                                    coordinates: coordinates,
                                    color: dataset.color
                                });
                            }
                        }
                    }
                });
            }
        });
  
        results.sort((a, b) => a.name.localeCompare(b.name));
        
        this.searchResults = results;
        return results;
    }

    searchInGeoJSONData(searchTerm) {
        if (!searchTerm || searchTerm.trim() === '') {
            return [];
        }

        const results = [];
        const normalizedSearch = searchTerm.toLowerCase().trim();

        Object.entries(this.datasets).forEach(([datasetKey, dataset]) => {
            if (dataset.geoJsonData && dataset.geoJsonData.features) {
                dataset.geoJsonData.features.forEach((feature, index) => {
                    const userData = feature.properties;
                    const name = this.extractName(userData);
                    
                    const lNac = (userData.L_Nac || '').trim();
                    const matchesBirthPlace = !this.currentBirthPlaceFilter || 
                                             lNac === this.currentBirthPlaceFilter;
                    
                    if (name !== 'Sin nombre' && matchesBirthPlace) {
                        const normalizedName = name.toLowerCase();
                        
                        if (normalizedName.includes(normalizedSearch)) {
                            results.push({
                                name: name,
                                dataset: dataset.name,
                                datasetKey: datasetKey,
                                feature: feature,
                                featureIndex: index,
                                userData: userData,
                                color: dataset.color,
                                coordinates: feature.geometry.coordinates
                            });
                        }
                    }
                });
            }
        });

        results.sort((a, b) => a.name.localeCompare(b.name));
        this.searchResults = results;
        return results;
    }
    
    setupSearchUI() {
        const searchContainer = document.createElement('div');
        searchContainer.id = 'soldier-search-container';
        searchContainer.style.cssText = `
            position: absolute;
            top: var(--bodyPadding);
            right: calc(var(--bodyPadding) + var(--panelWidth) + var(--bodyGap));
            background: var(--panelBg);
            padding: var(--cardPadding);
            border-radius: var(--borderRadius);
            color: white;
            font-family: 'Roboto';
            z-index: 2;
            width: calc(var(--panelWidth) * 2);
            display: flex;
            flex-direction: column;
            gap: var(--cardGap);
            height: fit-content;
        `;

        const searchLabel = document.createElement('label');
        searchLabel.htmlFor = 'soldier-search-input';
        searchLabel.textContent = 'Buscador';
        searchLabel.classList.add('input__label');

        const searchInput = document.createElement('input');
        searchInput.id = 'soldier-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Buscar soldado por nombre...';
        searchInput.style.cssText = `
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: var(--borderRadius);
            font-size: var(--cardFontSize);
            box-sizing: border-box;
        `;

        const filterLabel = document.createElement('label');
        filterLabel.htmlFor = 'birthplace-filter';
        filterLabel.textContent = 'Filtrar por lugar de nacimiento';
        filterLabel.classList.add('input__label');
        filterLabel.style.marginTop = '10px';

        const birthPlaceDropdown = document.createElement('select');
        birthPlaceDropdown.id = 'birthplace-filter';
        birthPlaceDropdown.style.cssText = `
            width: 100%;
            padding: 8px;
            border: none;
            border-radius: var(--borderRadius);
            font-size: var(--cardFontSize);
            box-sizing: border-box;
            cursor: pointer;
        `;

        this.populateBirthPlaceDropdown();

        const filterStats = document.createElement('div');
        filterStats.id = 'filter-stats';
        filterStats.style.cssText = `
            font-size: 12px;
            color: #4CAF50;
            display: none;
        `;

        const searchStats = document.createElement('div');
        searchStats.id = 'search-stats';
        searchStats.style.cssText = `
            font-size: 12px;
            color: #ccc;
            margin-bottom: 10px;
        `;

        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'search-results';
        resultsContainer.style.cssText = `
            max-height: var(--panelWidth);
            overflow-y: auto;
        `;

        searchContainer.appendChild(searchLabel);
        searchContainer.appendChild(searchInput);
        searchContainer.appendChild(filterLabel);
        searchContainer.appendChild(birthPlaceDropdown);
        searchContainer.appendChild(filterStats);
        searchContainer.appendChild(searchStats);
        searchContainer.appendChild(resultsContainer);
        document.body.appendChild(searchContainer);

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.performSearch(e.target.value);
            }, 300);
        });

        birthPlaceDropdown.addEventListener('change', (e) => {
            this.filterMarkersByBirthPlace(e.target.value);
        });
        
        document.addEventListener('click', (e) => {
            if (!searchContainer.contains(e.target)) {
                this.clearHoverEffect();
            }
        });
    }

    performSearch(searchTerm) {
        const results = this.searchByName(searchTerm);
        this.updateSearchResults(results, searchTerm, false);
    }
    
    updateSearchResults(results, searchTerm, isBirthPlaceFilter = false) {
        const resultsContainer = document.getElementById('search-results');
        const searchStats = document.getElementById('search-stats');

        if (searchTerm.trim() === '' && !isBirthPlaceFilter) {
            searchStats.textContent = '';
            resultsContainer.innerHTML = '';
            return;
        }

        const statsText = isBirthPlaceFilter 
            ? `${results.length} soldado${results.length !== 1 ? 's' : ''} de ${searchTerm}`
            : `${results.length} resultado${results.length !== 1 ? 's' : ''} encontrado${results.length !== 1 ? 's' : ''}`;
        
        searchStats.textContent = statsText;

        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            const noResults = document.createElement('div');
            noResults.textContent = isBirthPlaceFilter 
                ? 'No se encontraron soldados de este lugar'
                : 'No se encontraron soldados con ese nombre';
            noResults.style.cssText = 'color: #999; font-style: italic; padding: 10px;';
            resultsContainer.appendChild(noResults);
            return;
        }

        results.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.style.cssText = `
                padding: 8px;
                margin: 2px 0;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                cursor: pointer;
                border-left: 4px solid #${result.color.toString(16).padStart(6, '0')};
                transition: background-color 0.2s;
            `;

            const lNac = result.userData.L_Nac || 'Lugar no especificado';
            resultItem.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 2px;">${result.name}</div>
                <div style="font-size: 12px; color: #ccc;">${result.dataset}</div>
                <div style="font-size: 11px; color: #aaa;">${lNac}</div>
            `;

            resultItem.addEventListener('click', () => {
                this.focusOnResult(result);
            });

            resultItem.addEventListener('mouseenter', () => {
                resultItem.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            });

            resultItem.addEventListener('mouseleave', () => {
                resultItem.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            });

            resultsContainer.appendChild(resultItem);
        });
    }
    
    focusOnResult(result) {
        console.log('Focusing on:', result);
        console.log('Result structure:', {
            hasCoordinates: !!result.coordinates,
            hasMarker: !!result.marker,
            hasUserData: !!result.userData,
            markerPosition: result.marker?.position,
            userData: result.userData
        });
        
        this.simulateHoverEffect(result);
        
        let coordinates = null;
        
        if (result.coordinates && Array.isArray(result.coordinates) && result.coordinates.length >= 2) {
            coordinates = result.coordinates;
            console.log('Found coordinates in result.coordinates:', coordinates);
        } else if (result.marker?.userData) {
            const userData = result.marker.userData;
            coordinates = this.extractCoordinatesFromUserData(userData);
            if (coordinates) console.log('Found coordinates in marker.userData:', coordinates);
        } else if (result.userData) {
            coordinates = this.extractCoordinatesFromUserData(result.userData);
            if (coordinates) console.log('Found coordinates in result.userData:', coordinates);
        } else if (result.marker?.position) {
            const pos = result.marker.position;
            console.log('Found THREE.js position:', pos);
            console.log('You may need to convert THREE.js position back to lat/lon coordinates');
        }
        
        if (coordinates && coordinates.length >= 2) {
            const evento = {
                name: result.name,
                coordinates: coordinates,
                dataset: result.dataset,
                userData: result.userData || result.marker?.userData
            };

            this.highlightSoldier(evento);
            console.log(`Highlighting ${result.name} from ${result.dataset}`);
        } else {
            console.warn('No valid coordinates found for soldier:', result.name);
            console.log('Available data:', {
                result: result,
                marker: result.marker,
                userData: result.userData || result.marker?.userData
            });
        }
    }
    
    extractCoordinatesFromUserData(userData) {
        if (!userData) return null;
        
        if (userData.originalCoords && userData.originalCoords.lat && userData.originalCoords.lon) {
            const { lat, lon } = userData.originalCoords;
            return [lon, lat];
        }
        
        let lat = null;
        let lon = null;
        
        lat = userData.lat || userData.latitude || userData.Latitude || 
              userData.LAT || userData.LATITUDE;
              
        lon = userData.lon || userData.longitude || userData.Longitude || 
              userData.LON || userData.LONGITUDE || userData.lng;
        
        if (typeof lat === 'number' && typeof lon === 'number') {
            return [lon, lat];
        }
        
        if (lat !== null && lon !== null) {
            const numLat = parseFloat(lat);
            const numLon = parseFloat(lon);
            
            if (!isNaN(numLat) && !isNaN(numLon)) {
                return [numLon, numLat];
            }
        }
        
        console.log('Could not extract coordinates from userData:', userData);
        return null;
    }
    
    simulateHoverEffect(result) {
        if (!result.marker || !tooltip) {
            console.warn('Marker or tooltip not available for hover simulation');
            return;
        }

        const marker = result.marker;
        const userData = result.userData || marker.userData;

        if (!marker.material) {
            console.warn('Marker does not have material property:', marker);
            return;
        }

        if (window.hoveredMarker && window.hoveredMarker !== marker && window.hoveredMarker.material) {
            window.hoveredMarker.material.opacity = 0.4;
            window.hoveredMarker.material.emissiveIntensity = 2.5;
        }

        window.hoveredMarker = marker;
        if (marker.material) {
            marker.material.opacity = 1.0;
            marker.material.emissiveIntensity = 3.5;
        }

        const age = userData.age;
        const name = userData.Nombre || userData.NOMBRE || userData.nombre || 'Sin nombre';
        const fNac = userData.F_Nac || 'Sin fecha';
        const fDeceso = userData.F_Deceso || 'Sin fecha';
        const LDeceso = userData.L_Deceso || 'Sin lugar';
        const LNac = userData.L_Nac || 'Lugar no especificado';
        const Escalafon = userData.Escalafon || 'Sin escalafón';

        if (tooltip) {
            tooltip.innerHTML = `
                <strong>${name}</strong><br>
                Edad: ${age} años<br>
                <small>Lugar de nacimiento: ${LNac}</small><br>
                <small>Nac: ${fNac} - Dec: ${fDeceso}</small><br>
                <small>Lugar: ${LDeceso}</small><br>
                <small>Escalafón: ${Escalafon}</small>
            `;
            tooltip.style.display = 'block';
            
            const searchContainer = document.getElementById('soldier-search-container');
            if (searchContainer) {
                const rect = searchContainer.getBoundingClientRect();
                tooltip.style.left = (rect.right + 15) + 'px';
                tooltip.style.top = (rect.top + 50) + 'px';
            }
        }

        document.body.style.cursor = 'pointer';

        setTimeout(() => {
            this.clearHoverEffect();
        }, 5000);
    }

    clearHoverEffect() {
        if (window.hoveredMarker && window.hoveredMarker.material) {
            window.hoveredMarker.material.opacity = 0.4;
            window.hoveredMarker.material.emissiveIntensity = 2.5;
            window.hoveredMarker = null;
        }

        if (tooltip) {
            tooltip.style.display = 'none';
        }

        document.body.style.cursor = 'default';
    }
    
    highlightSoldier(evento) {
        if (!evento.coordinates || !globalBounds || !camera || !controls || !scene) {
            console.warn('Required globals not available for highlighting');
            return;
        }

        const [lon, lat] = evento.coordinates;
        const pos = latLonToXY(lat, lon, globalBounds);

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

        this.zoomToSoldier(pos, evento);

        let opacity = 0.8;
        const fadeOut = () => {
            opacity -= 0.01;
            material.opacity = opacity;
            if (opacity > 0) {
                requestAnimationFrame(fadeOut);
            } else {
                scene.remove(highlight);
                geometry.dispose();
                material.dispose();
            }
        };

        setTimeout(fadeOut, 1000);
    }

    zoomToSoldier(pos, soldierEvento) {
        if (!camera || !controls) return;

        const targetPosition = {
            x: pos.x,
            y: camera.position.y * 0.7,
            z: -pos.y + 10
        };

        controls.target.set(pos.x, 0, -pos.y);

        const startPosition = {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        };

        const animationDuration = 1000;
        const startTime = Date.now();

        const animateCamera = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            
            const easeOut = 1 - Math.pow(1 - progress, 3);

            camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * easeOut;
            camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * easeOut;
            camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * easeOut;

            controls.update();

            if (progress < 1) {
                requestAnimationFrame(animateCamera);
            }
        };

        animateCamera();
    }
    
    getSearchStats() {
        const stats = {
            totalSoldiers: 0,
            soldiersByDataset: {}
        };

        Object.entries(this.datasets).forEach(([key, dataset]) => {
            let count = 0;
            if (dataset.allMarkers) {
                dataset.allMarkers.forEach(marker => {
                    if (marker.userData) {
                        const name = this.extractName(marker.userData);
                        if (name !== 'Sin nombre') {
                            count++;
                        }
                    }
                });
            }
            
            stats.soldiersByDataset[dataset.name] = count;
            stats.totalSoldiers += count;
        });

        return stats;
    }
}

const soldierSearch = new SoldierSearch(datasets);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onClick);

setupLighting();
init();
animate();

export { scene, camera, renderer, datasets, composer };