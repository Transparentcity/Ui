/** Lightweight mapbox-gl stub for vitest (real bundle OOMs workers). */
const noop = () => undefined;

class Map {
  addControl = noop;
  on = noop;
  off = noop;
  remove = noop;
  resize = noop;
  getCanvas = () => ({ style: {} });
  getContainer = () => document.createElement("div");
  fitBounds = noop;
  setCenter = noop;
  setZoom = noop;
  addSource = noop;
  removeSource = noop;
  addLayer = noop;
  removeLayer = noop;
  getSource = () => null;
  getLayer = () => null;
  loaded = () => true;
}

class Marker {
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove = noop;
  setPopup() {
    return this;
  }
}

class NavigationControl {}
class Popup {
  setHTML() {
    return this;
  }
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
  remove = noop;
}

const mapboxgl = {
  Map,
  Marker,
  NavigationControl,
  Popup,
  accessToken: "",
};

export default mapboxgl;
