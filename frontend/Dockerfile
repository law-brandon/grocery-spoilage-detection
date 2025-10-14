# ---------- Build Stage ----------
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build


# ---------- Serve Stage ----------
FROM nginx:alpine

# Copy build output to nginx html directory
COPY --from=build /app/build /usr/share/nginx/html

# (Optional) Add custom Nginx config if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 for ECS/ELB
EXPOSE 80

# Run nginx in foreground (so ECS knows container is alive)
CMD ["nginx", "-g", "daemon off;"]