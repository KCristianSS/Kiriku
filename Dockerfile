# Imagen oficial de Node.js 22 ligera (compatible con Docker Desktop Windows/Mac/Linux)
FROM node:22-alpine

# Instalar zona horaria (America/La_Paz)
RUN apk add --no-cache tzdata
ENV TZ=America/La_Paz

WORKDIR /app

# Copiar manifiestos e instalar dependencias dentro del contenedor Linux
COPY package*.json ./
RUN npm install

# Copiar el código fuente y compilar el frontend Vite (dist/)
COPY . .
RUN npm run build

# Configuración de producción
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Verificación automática de salud para Docker Desktop
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Iniciar servidor Express + API + Frontend compilado + Swagger UI
CMD ["npm", "run", "start"]