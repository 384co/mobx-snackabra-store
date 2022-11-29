import * as React from "react";
import SnackabraStore from "../stores/Snackabra.Store";
const SnackabraContext = /*#__PURE__*/React.createContext(undefined);
export class SnackabraProvider extends React.Component {
  state = {
    sbContext: {},
    ready: false
  };
  componentDidMount() {
    const sbContext = new SnackabraStore(this.props.config);
    sbContext.init().then(() => {
      this.setState({
        sbContext: sbContext,
        ready: true
      }, () => {
        console.log("SB Store is ready");
      });
    });
  }
  render() {
    return /*#__PURE__*/React.createElement(React.Fragment, null, this.state.ready ? /*#__PURE__*/React.createElement(SnackabraContext.Provider, {
      value: this.state.sbContext
    }, this.props.children) : '');
  }
}
;
export default SnackabraContext;