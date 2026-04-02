import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Auth0Provider } from '@auth0/auth0-react';
import App from './App';
import { appBasePath } from './authPaths';
import './App.css';

const domain = 'snaptracker.auth0.com';
const clientId = 'tZfIHcyLn6w2TqXSqILCLoAD6YyJ9JkL';
const audience = 'https://snuffd-api';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        useRefreshTokens={true}
        cacheLocation="localstorage"
        authorizationParams={{
          redirect_uri: appBasePath(),
          audience,
          scope: 'openid profile email offline_access',
        }}
      >
        <App />
      </Auth0Provider>
    </HashRouter>
  </React.StrictMode>
);
