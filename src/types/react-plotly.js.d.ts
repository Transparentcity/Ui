declare module "react-plotly.js" {
  import { Component, CSSProperties } from "react";
  import { Data, Layout, Config } from "plotly.js";

  export interface PlotParams {
    data: Data[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    frames?: unknown[];
    revision?: number;
    onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: unknown, graphDiv: HTMLElement) => void;
    onPurge?: (figure: unknown, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    debug?: boolean;
    useResizeHandler?: boolean;
    style?: CSSProperties;
    className?: string;
  }

  export default class Plot extends Component<PlotParams> {}
}
