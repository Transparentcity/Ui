// Type declarations for mapbox-gl
// These provide basic typing until @types/mapbox-gl can be installed

declare namespace mapboxgl {
  interface LngLatLike {
    lng: number;
    lat: number;
  }

  interface LngLatBoundsLike {
    _sw: LngLatLike;
    _ne: LngLatLike;
  }

  interface PointLike {
    x: number;
    y: number;
  }

  interface MapboxGeoJSONFeature {
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown> | null;
    id?: string | number;
    layer?: unknown;
    source?: string;
    sourceLayer?: string;
    state?: Record<string, unknown>;
  }

  interface MapMouseEvent {
    type: string;
    target: Map;
    originalEvent: MouseEvent;
    point: PointLike;
    lngLat: LngLatLike;
    features?: MapboxGeoJSONFeature[];
    preventDefault(): void;
  }

  interface MapLayerMouseEvent extends MapMouseEvent {
    features?: MapboxGeoJSONFeature[];
  }

  interface PopupOptions {
    closeButton?: boolean;
    closeOnClick?: boolean;
    closeOnMove?: boolean;
    focusAfterOpen?: boolean;
    anchor?: string;
    offset?: number | PointLike | Record<string, PointLike>;
    className?: string;
    maxWidth?: string;
  }

  class Popup {
    constructor(options?: PopupOptions);
    addTo(map: Map): this;
    isOpen(): boolean;
    remove(): this;
    getLngLat(): LngLatLike;
    setLngLat(lnglat: LngLatLike | [number, number]): this;
    trackPointer(): this;
    getElement(): HTMLElement;
    setText(text: string): this;
    setHTML(html: string): this;
    setMaxWidth(maxWidth: string): this;
    addClassName(className: string): this;
    removeClassName(className: string): this;
    setOffset(offset: number | PointLike | Record<string, PointLike>): this;
    toggleClassName(className: string): boolean;
    on(type: string, listener: (e: unknown) => void): this;
    off(type: string, listener: (e: unknown) => void): this;
  }

  interface MapOptions {
    container: HTMLElement | string;
    style?: string | object;
    center?: [number, number] | LngLatLike;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    bearing?: number;
    pitch?: number;
    bounds?: LngLatBoundsLike | [number, number, number, number];
    fitBoundsOptions?: unknown;
    interactive?: boolean;
    attributionControl?: boolean;
    customAttribution?: string | string[];
    logoPosition?: string;
    failIfMajorPerformanceCaveat?: boolean;
    preserveDrawingBuffer?: boolean;
    antialias?: boolean;
    refreshExpiredTiles?: boolean;
    maxBounds?: LngLatBoundsLike;
    scrollZoom?: boolean | unknown;
    boxZoom?: boolean;
    dragRotate?: boolean;
    dragPan?: boolean | unknown;
    keyboard?: boolean;
    doubleClickZoom?: boolean;
    touchZoomRotate?: boolean | unknown;
    touchPitch?: boolean | unknown;
    trackResize?: boolean;
    cooperativeGestures?: boolean;
    renderWorldCopies?: boolean;
    maxTileCacheSize?: number;
    localIdeographFontFamily?: string;
    transformRequest?: (url: string, resourceType: string) => unknown;
    collectResourceTiming?: boolean;
    fadeDuration?: number;
    crossSourceCollisions?: boolean;
    accessToken?: string;
    locale?: Record<string, string>;
    testMode?: boolean;
    projection?: unknown;
  }

  class Map {
    constructor(options: MapOptions);
    
    addControl(control: unknown, position?: string): this;
    removeControl(control: unknown): this;
    
    resize(eventData?: unknown): this;
    getBounds(): LngLatBoundsLike;
    getMaxBounds(): LngLatBoundsLike | null;
    setMaxBounds(bounds?: LngLatBoundsLike | null): this;
    setMinZoom(minZoom?: number | null): this;
    getMinZoom(): number;
    setMaxZoom(maxZoom?: number | null): this;
    getMaxZoom(): number;
    setMinPitch(minPitch?: number | null): this;
    getMinPitch(): number;
    setMaxPitch(maxPitch?: number | null): this;
    getMaxPitch(): number;
    
    getCenter(): LngLatLike;
    setCenter(center: LngLatLike | [number, number], eventData?: unknown): this;
    panBy(offset: PointLike | [number, number], options?: unknown, eventData?: unknown): this;
    panTo(lnglat: LngLatLike | [number, number], options?: unknown, eventData?: unknown): this;
    getZoom(): number;
    setZoom(zoom: number, eventData?: unknown): this;
    zoomTo(zoom: number, options?: unknown, eventData?: unknown): this;
    zoomIn(options?: unknown, eventData?: unknown): this;
    zoomOut(options?: unknown, eventData?: unknown): this;
    getBearing(): number;
    setBearing(bearing: number, eventData?: unknown): this;
    rotateTo(bearing: number, options?: unknown, eventData?: unknown): this;
    resetNorth(options?: unknown, eventData?: unknown): this;
    resetNorthPitch(options?: unknown, eventData?: unknown): this;
    snapToNorth(options?: unknown, eventData?: unknown): this;
    getPitch(): number;
    setPitch(pitch: number, eventData?: unknown): this;
    
    fitBounds(bounds: LngLatBoundsLike | [[number, number], [number, number]], options?: unknown, eventData?: unknown): this;
    jumpTo(options: unknown, eventData?: unknown): this;
    easeTo(options: unknown, eventData?: unknown): this;
    flyTo(options: unknown, eventData?: unknown): this;
    
    getFreeCameraOptions(): unknown;
    setFreeCameraOptions(options: unknown, eventData?: unknown): this;
    
    isMoving(): boolean;
    isZooming(): boolean;
    isRotating(): boolean;
    
    on(type: string, listener: (e: unknown) => void): this;
    on(type: string, layerId: string, listener: (e: MapLayerMouseEvent) => void): this;
    once(type: string, listener: (e: unknown) => void): this;
    once(type: string, layerId: string, listener: (e: MapLayerMouseEvent) => void): this;
    off(type: string, listener: (e: unknown) => void): this;
    off(type: string, layerId: string, listener: (e: MapLayerMouseEvent) => void): this;
    
    getContainer(): HTMLElement;
    getCanvasContainer(): HTMLElement;
    getCanvas(): HTMLCanvasElement;
    
    loaded(): boolean;
    remove(): void;
    
    triggerRepaint(): void;
    
    addSource(id: string, source: unknown): this;
    isSourceLoaded(id: string): boolean;
    removeSource(id: string): this;
    getSource(id: string): unknown;
    
    addImage(id: string, image: unknown, options?: unknown): void;
    updateImage(id: string, image: unknown): void;
    hasImage(id: string): boolean;
    removeImage(id: string): void;
    loadImage(url: string, callback: (error?: Error, result?: HTMLImageElement | ImageBitmap) => void): void;
    listImages(): string[];
    
    addLayer(layer: unknown, before?: string): this;
    moveLayer(id: string, beforeId?: string): this;
    removeLayer(id: string): this;
    getLayer(id: string): unknown;
    setLayoutProperty(layerId: string, name: string, value: unknown, options?: unknown): this;
    getLayoutProperty(layerId: string, name: string): unknown;
    setPaintProperty(layerId: string, name: string, value: unknown, options?: unknown): this;
    getPaintProperty(layerId: string, name: string): unknown;
    setFilter(layerId: string, filter?: unknown | null, options?: unknown): this;
    getFilter(layerId: string): unknown;
    setLayerZoomRange(layerId: string, minzoom: number, maxzoom: number): this;
    
    getStyle(): unknown;
    setStyle(style: string | unknown, options?: unknown): this;
    
    queryRenderedFeatures(geometry?: PointLike | [PointLike, PointLike], options?: unknown): MapboxGeoJSONFeature[];
    querySourceFeatures(sourceId: string, parameters?: unknown): MapboxGeoJSONFeature[];
    
    setFeatureState(feature: { source: string; sourceLayer?: string; id: string | number }, state: unknown): void;
    removeFeatureState(target: { source: string; sourceLayer?: string; id?: string | number }, key?: string): void;
    getFeatureState(feature: { source: string; sourceLayer?: string; id: string | number }): unknown;
    
    project(lnglat: LngLatLike): PointLike;
    unproject(point: PointLike): LngLatLike;
    
    showTileBoundaries: boolean;
    showCollisionBoxes: boolean;
    showOverdrawInspector: boolean;
    repaint: boolean;
  }

  class NavigationControl {
    constructor(options?: { showCompass?: boolean; showZoom?: boolean; visualizePitch?: boolean });
  }

  class ScaleControl {
    constructor(options?: { maxWidth?: number; unit?: string });
    setUnit(unit: string): void;
  }

  class GeolocateControl {
    constructor(options?: unknown);
    trigger(): boolean;
  }

  class AttributionControl {
    constructor(options?: { compact?: boolean; customAttribution?: string | string[] });
  }

  class FullscreenControl {
    constructor(options?: { container?: HTMLElement });
  }

  let accessToken: string;
  const supported: (options?: { failIfMajorPerformanceCaveat?: boolean }) => boolean;
  const version: string;
}

declare module "mapbox-gl" {
  export = mapboxgl;
}

declare module "mapbox-gl/dist/mapbox-gl.css" {
  const content: string;
  export default content;
}
