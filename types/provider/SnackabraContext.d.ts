import * as React from "react";
declare const SnackabraContext: any;
export declare class SnackabraProvider extends React.Component {
    state: {
        sbContext: {};
        ready: boolean;
    };
    componentDidMount(): void;
    loadChannelList: () => void;
    render(): any;
}
export default SnackabraContext;
