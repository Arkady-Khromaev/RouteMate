
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '');
const WS_BASE_URL = API_BASE_URL.replace('http://', 'ws://').replace('https://', 'wss://');

function buildQuery(params) {
  return new URLSearchParams(params).toString();
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;

    try {
      const err = await response.json();
      detail = err.detail || err.message || detail;
    } catch (_e) {}

    throw new Error(detail);
  }

  return await response.json();
}

class RouteMATEAPI {
  async healthCheck() {
    try {
      return await jsonFetch(`${API_ROOT_URL}/`);
    } catch (_error) {
      return { status: 'offline' };
    }
  }

  async getCurrentPolicy() {
    return await jsonFetch(`${API_BASE_URL}/policy/current`);
  }

  async switchPolicy(policy) {
    return await jsonFetch(
      `${API_BASE_URL}/policy/switch?policy=${encodeURIComponent(policy)}`,
      { method: 'POST' }
    );
  }

  async getVehicles() {
    return await jsonFetch(`${API_BASE_URL}/vehicles`);
  }

  async requestRide(pickup, dropoff, policy = 'greedy', userContext = null) {
    // Validate both locations before making the API request.
    const pickupGrid = this.latLngToGrid(pickup);
    const dropoffGrid = this.latLngToGrid(dropoff);

    return await jsonFetch(`${API_BASE_URL}/request-ride`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup: {
          x: pickupGrid.x,
          y: pickupGrid.y,
          lat: pickup.lat,
          lng: pickup.lng,
          address: pickup.address || pickup.label || null,
        },
        dropoff: {
          x: dropoffGrid.x,
          y: dropoffGrid.y,
          lat: dropoff.lat,
          lng: dropoff.lng,
          address: dropoff.address || dropoff.label || null,
        },
        policy,
        user_id: userContext?.userId,
        user_name: userContext?.userName,
        user_email: userContext?.userEmail,
      }),
    });
  }

  async reverseGeocode(lat, lng) {
    return await jsonFetch(
      `${API_BASE_URL}/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
    );
  }

  async getUserRouteSuggestion(userId) {
    return await jsonFetch(
      `${API_BASE_URL}/users/${encodeURIComponent(userId)}/route-suggestion`
    );
  }

  async getRideState(rideId) {
    return await jsonFetch(`${API_BASE_URL}/rides/${encodeURIComponent(rideId)}`);
  }

  async getRideComparison(rideId, userId) {
    const query = buildQuery({ user_id: userId });

    return await jsonFetch(
      `${API_BASE_URL}/rides/${encodeURIComponent(rideId)}/comparison?${query}`
    );
  }

  async cancelRide(rideId, userId) {
    return await jsonFetch(
      `${API_BASE_URL}/rides/${encodeURIComponent(rideId)}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      }
    );
  }

  async geocodeAddress(address) {
    const query = buildQuery({ address });

    return await jsonFetch(`${API_BASE_URL}/geo/geocode?${query}`);
  }

  async getRoute(pickup, dropoff) {
    const query = buildQuery({
      pickup_lat: String(pickup.lat),
      pickup_lng: String(pickup.lng),
      dropoff_lat: String(dropoff.lat),
      dropoff_lng: String(dropoff.lng),
    });

    return await jsonFetch(`${API_BASE_URL}/geo/route?${query}`);
  }

  getRideWebSocketUrl(userId) {
    return `${WS_BASE_URL.replace('/api', '')}/ws/rides/${userId}`;
  }

  async getStats() {
    return await jsonFetch(`${API_BASE_URL}/stats`);
  }

  async reloadMLModel() {
    return await jsonFetch(`${API_BASE_URL}/model/reload`, {
      method: 'POST',
    });
  }

  async runSimulation(params = {}) {
    const {
      policy = 'greedy',
      numSteps = 100,
      numVehicles = 5,
      requestRate = 2.0,
      vehicleCapacity = 4,
    } = params;

    return await jsonFetch(`${API_BASE_URL}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        policy,
        num_steps: numSteps,
        num_vehicles: numVehicles,
        request_rate: requestRate,
        vehicle_capacity: vehicleCapacity,
      }),
    });
  }

  // Validate geographic coordinates before converting them to grid cells.
  latLngToGrid(coords) {
    const { lat, lng } = coords || {};

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      throw new Error(
        'Invalid coordinates. Please provide a valid numeric latitude and longitude.'
      );
    }

    const MIN_LAT = 18.89;
    const MAX_LAT = 19.27;
    const MIN_LNG = 72.77;
    const MAX_LNG = 73.0;
    const GRID_SIZE = 10;

    if (
      lat < MIN_LAT ||
      lat > MAX_LAT ||
      lng < MIN_LNG ||
      lng > MAX_LNG
    ) {
      throw new Error(
        `Location is outside the supported service area. ` +
        `Choose a location within latitude ${MIN_LAT}–${MAX_LAT} ` +
        `and longitude ${MIN_LNG}–${MAX_LNG}.`
      );
    }

    // Preserve correct conversion for valid coordinates.
    // The maximum boundary maps to cell 9, not cell 10.
    const x = Math.min(
      GRID_SIZE - 1,
      Math.floor(
        ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * GRID_SIZE
      )
    );

    const y = Math.min(
      GRID_SIZE - 1,
      Math.floor(
        ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * GRID_SIZE
      )
    );

    return { x, y };
  }

  gridToLatLng(x, y) {
    return {
      lat: 18.89 + (y / 10) * (19.27 - 18.89),
      lng: 72.77 + (x / 10) * (73.0 - 72.77),
    };
  }

  formatVehicleForMap(vehicle) {
    const x = vehicle.location?.x ?? 0;
    const y = vehicle.location?.y ?? 0;
    const pos = this.gridToLatLng(x, y);

    return {
      id: vehicle.vehicle_id,
      position: [pos.lat, pos.lng],
      occupancy: vehicle.occupancy,
      capacity: vehicle.capacity,
      status: vehicle.is_idle ? 'idle' : 'busy',
      name: `Vehicle ${vehicle.vehicle_id}`,
    };
  }

  async getSurgeSmartAdvice(pickupLat, pickupLng, dropoffLat, dropoffLng) {
    const query = buildQuery({
      pickup_lat: String(pickupLat),
      pickup_lng: String(pickupLng),
      dropoff_lat: String(dropoffLat),
      dropoff_lng: String(dropoffLng),
    });

    return await jsonFetch(`${API_BASE_URL}/surge/smart-advice?${query}`);
  }

  async getSurgePrediction(lat, lng, horizonMin = 30) {
    const query = buildQuery({
      lat: String(lat),
      lng: String(lng),
      horizon_min: String(horizonMin),
    });

    return await jsonFetch(`${API_BASE_URL}/surge/predict?${query}`);
  }

  async getSurgeHeatmap(lat, lng, radiusCells = 3) {
    const query = buildQuery({
      lat: String(lat),
      lng: String(lng),
      radius_cells: String(radiusCells),
    });

    return await jsonFetch(`${API_BASE_URL}/surge/heatmap?${query}`);
  }

  async getCurrentSurge(lat, lng) {
    const query = buildQuery({
      lat: String(lat),
      lng: String(lng),
    });

    return await jsonFetch(`${API_BASE_URL}/surge/current?${query}`);
  }

  async getRideExplanation(rideId, userId) {
    const query = userId ? buildQuery({ user_id: userId }) : '';

    return await jsonFetch(
      `${API_BASE_URL}/rides/${encodeURIComponent(rideId)}/explain${query ? '?' + query : ''}`
    );
  }
}

const api = new RouteMATEAPI();

export default api;

export const runSimulation = (...args) => api.runSimulation(...args);
export const healthCheck = (...args) => api.healthCheck(...args);
export const getCurrentPolicy = (...args) => api.getCurrentPolicy(...args);
export const getVehicles = (...args) => api.getVehicles(...args);
export const requestRide = (...args) => api.requestRide(...args);
export const getSurgeSmartAdvice = (...args) => api.getSurgeSmartAdvice(...args);
export const getSurgePrediction = (...args) => api.getSurgePrediction(...args);
