import * as React from "react"
import SnackabraStore from "../stores/Snackabra.Store"


const SnackabraContext = React.createContext(undefined);


export class SnackabraProvider extends React.Component {
  state = {
    sbContext: {},
    ready: false
  }

  componentDidMount() {
    const sbContext = new SnackabraStore(this.props.config)

    sbContext.init().then(() => {
      console.log(sbContext)
      this.setState({ sbContext: sbContext, ready: true })
    })
  }

  render() {
    return (<>
      {
        this.state.ready ?
          <SnackabraContext.Provider value={this.state.sbContext}>
            {this.props.children}
          </SnackabraContext.Provider>
          : ''
      }
    </>)

  }

};

export default SnackabraContext;