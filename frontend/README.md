# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Connecting to the API

During local development, the frontend uses `http://localhost:8000/api/` by default. Start Django from `BACKEND` with `python manage.py migrate` and `python manage.py runserver`.

To use a different API URL, set `VITE_API_BASE_URL` in `frontend/.env.local`, for example:

```env
VITE_API_BASE_URL=http://localhost:8000/api/
```

For a deployed frontend, set `VITE_API_BASE_URL` to the deployed backend API URL in the frontend hosting environment. Vite embeds this value at build time; rebuild and redeploy the frontend after changing it.
