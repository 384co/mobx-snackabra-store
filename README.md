<img src="https://user-images.githubusercontent.com/844289/156240563-cfa8d1ff-fd55-43d7-a867-e9e7c77d183e.svg" width="100">

# Snackabra Mobx Store and React Context

## Prerequsites

snackabra-jslib should be checked out in the same directory as mobx-snackabra-store

## Installation

```sh
git clone https://github.com/384co/mobx-snackabra-store.git
```

```sh
cd mobx-snackabra-store
```

```sh
yarn install
```


## Running the project

Running the project is for development purposes. It will watch the ./src directory and build the project out to ./lib as changes occure in the ./src directory.

```sh
yarn start
```

## Building the project

```sh
yarn build
```

## Consuming in a React UI
App.js example
```jsx
import React from "react"
import Home from "./Home";
import theme from "./theme";
import { SnackabraProvider } from "mobx-snackabra-store";

const sbConfig = {
  channel_server: process.env.REACT_APP_CHANNEL_SERVER,
  channel_ws: process.env.REACT_APP_CHANNEL_SERVER_WS,
  storage_server: process.env.REACT_APP_SHARD_SERVER
}

const App = () => {
  return (
        <SnackabraProvider config={sbConfig}>
            <Home />
        </SnackabraProvider>
  )
}

export default App
```

Home.js example
```jsx
/* Copyright (c) 2021 Magnusson Institute, All Rights Reserved */

import * as React from "react"
import { observer } from "mobx-react"
import { SnackabraContext } from "mobx-snackabra-store";

const Home = observer((props) => {
  const sbContext = React.useContext(SnackabraContext);
  return (
    <div>
        {/* can now use sbContext here to interface to snackabra-jslib*/}
    </div>
  )
})

export default Home;

```