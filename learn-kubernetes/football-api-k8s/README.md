# Football API en Kubernetes local

Backend Node/Express + PostgreSQL desplegado en un cluster k3d local. Proyecto de aprendizaje para dominar los conceptos core de Kubernetes: Deployments, Services, Ingress, ConfigMaps, Secrets, PVCs y health checks — todo en tu máquina, sin cuenta de cloud.

## Arquitectura

```
Internet / localhost
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  k3d cluster: football-cluster                          │
│                                                         │
│  ┌─────────────────────┐                                │
│  │  Ingress Controller │  ← localhost:80                │
│  │  (ingress-nginx)    │                                │
│  └─────────┬───────────┘                                │
│            │ /api → football-api-service:80             │
│            ▼                                            │
│  ┌─────────────────────┐    ┌──────────────────────┐    │
│  │  football-api       │    │  postgres            │    │
│  │  Pod (réplica 1)    │───▶│  Pod                 │    │
│  │  Pod (réplica 2)    │    │  (con PVC de 1Gi)    │    │
│  └─────────────────────┘    └──────────────────────┘    │
│        ↑ ConfigMap                ↑ Secret              │
└─────────────────────────────────────────────────────────┘
```

## Estructura

```
football-api-k8s/
├── src/
│   └── index.ts            # Express app: GET /api/players, GET /health, POST /api/players
├── Dockerfile              # Multi-stage build
├── package.json
├── tsconfig.json
└── k8s/
    ├── kustomization.yaml  # punto de entrada para kubectl apply -k
    ├── base/
    │   ├── secret.yaml     # credenciales Postgres (base64)
    │   └── configmap.yaml  # config del backend (PORT, DB_HOST, DB_NAME)
    ├── postgres/
    │   ├── pvc.yaml        # storage persistente de 1Gi
    │   ├── deployment.yaml # Deployment de postgres:16-alpine
    │   └── service.yaml    # Service ClusterIP (solo accesible internamente)
    ├── backend/
    │   ├── deployment.yaml # Deployment con 2 réplicas + liveness/readiness probes
    │   └── service.yaml    # Service NodePort (puerto 30080)
    └── ingress/
        └── ingress.yaml    # Ingress nginx: localhost/api → backend
```

---

## Pre-requisitos: instalar herramientas

### 1. Docker

k3d corre Kubernetes en containers de Docker. Necesitás Docker Desktop o Docker Engine.

```bash
# Verificar
docker --version  # Docker version 25.x.x o superior
```

### 2. k3d

```bash
# Windows (PowerShell como admin)
winget install k3d

# macOS
brew install k3d

# Linux
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Verificar
k3d version
```

### 3. kubectl

```bash
# Windows (PowerShell como admin)
winget install Kubernetes.kubectl

# macOS
brew install kubectl

# Verificar
kubectl version --client
```

---

## Paso 1: Crear el cluster con ingress-nginx

El siguiente comando crea un cluster k3d de 1 nodo con:
- `--k3s-arg "--disable=traefik@server:0"` → deshabilita Traefik (el ingress default de k3s) para instalar nginx nosotros
- `-p "80:80@loadbalancer"` → mapea el puerto 80 del host al puerto 80 del cluster → `localhost:80` llega al Ingress Controller

```bash
k3d cluster create football-cluster \
  --k3s-arg "--disable=traefik@server:0" \
  -p "80:80@loadbalancer" \
  -p "443:443@loadbalancer"
```

Verificar que kubectl apunta al cluster nuevo:

```bash
kubectl config current-context
# Debe mostrar: k3d-football-cluster

kubectl get nodes
# Debe mostrar el nodo k3d-football-cluster-server-0 en estado Ready
```

### Instalar ingress-nginx

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml

# Esperar a que el controller esté listo (puede tardar 1-2 minutos)
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

---

## Paso 2: Construir y cargar la imagen Docker

### Opción A: cargar la imagen localmente con k3d (sin Docker Hub)

```bash
# Construir la imagen (desde la raíz de football-api-k8s/)
docker build -t football-api:latest .

# Cargar la imagen en el cluster k3d
# Esto copia la imagen de tu Docker local al cluster — sin registry externo
k3d image load football-api:latest --cluster football-cluster

# Verificar que la imagen está disponible en el cluster
kubectl run test --image=football-api:latest --image-pull-policy=Never --restart=Never -- echo ok
kubectl delete pod test
```

### Opción B: usar Docker Hub

```bash
# Tagear y pushear
docker build -t tuusuario/football-api:latest .
docker push tuusuario/football-api:latest

# Actualizar el Deployment: cambiar image: football-api:latest
# por image: tuusuario/football-api:latest
# y imagePullPolicy: Never → imagePullPolicy: Always
```

---

## Paso 3: Aplicar los manifests

### Opción A: con Kustomize (recomendado)

```bash
# Desde la raíz de football-api-k8s/
kubectl apply -k k8s/

# Ver el resultado
kubectl get all
```

### Opción B: en orden manual

```bash
kubectl apply -f k8s/base/secret.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/postgres/pvc.yaml
kubectl apply -f k8s/postgres/deployment.yaml
kubectl apply -f k8s/postgres/service.yaml
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml
kubectl apply -f k8s/ingress/ingress.yaml
```

---

## Paso 4: Verificar que todo corre

```bash
# Ver todos los Pods (deben estar Running)
kubectl get pods
# NAME                                     READY   STATUS    RESTARTS   AGE
# football-api-deployment-xxx-yyy          1/1     Running   0          2m
# football-api-deployment-xxx-zzz          1/1     Running   0          2m
# postgres-deployment-xxx-yyy              1/1     Running   0          2m

# Ver Services
kubectl get services
# NAME                    TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
# football-api-service    NodePort    10.43.xxx.xxx   <none>        80:30080/TCP   2m
# postgres-service        ClusterIP   10.43.yyy.yyy   <none>        5432/TCP       2m

# Ver Ingress
kubectl get ingress
# NAME                    CLASS   HOSTS   ADDRESS         PORTS   AGE
# football-api-ingress    nginx   *       172.18.0.xxx    80      2m

# Ver logs del backend
kubectl logs deployment/football-api-deployment
```

---

## Paso 5: Probar los endpoints

```bash
# Listar jugadores (via Ingress en localhost:80)
curl http://localhost/api/players

# Health check
curl http://localhost/health

# Crear un jugador
curl -X POST http://localhost/api/players \
  -H "Content-Type: application/json" \
  -d '{"name": "Rodrigo Gallego", "position": "Mediocampista", "team": "River Plate", "goals": 5}'

# Acceso directo via NodePort (sin Ingress)
curl http://localhost:30080/api/players
```

Respuesta esperada:

```json
{
  "count": 4,
  "players": [
    { "id": 1, "name": "Lionel Messi", "position": "Delantero", "team": "Inter Miami", "goals": 820 },
    ...
  ]
}
```

---

## Debugging

### Pod en CrashLoopBackOff

```bash
# Ver eventos y causa del crash
kubectl describe pod <nombre-del-pod>

# Ver los logs del run anterior (antes del restart)
kubectl logs <nombre-del-pod> --previous
```

### Error de imagen no encontrada (ImagePullBackOff)

```bash
# Verificar que la imagen fue cargada en k3d
k3d image list --cluster football-cluster

# Re-cargar si es necesario
k3d image load football-api:latest --cluster football-cluster
```

### Backend no conecta a Postgres

```bash
# Verificar que el Pod de Postgres está Running
kubectl get pods | grep postgres

# Conectarse a Postgres directamente
kubectl exec -it deployment/postgres-deployment -- psql -U postgres -d footballdb

# Verificar que la tabla existe
\dt
SELECT * FROM players;
```

### Entrar al container del backend

```bash
kubectl exec -it deployment/football-api-deployment -- /bin/sh

# Desde adentro, verificar que puede resolver el DNS del Service
nslookup postgres-service
wget -qO- http://localhost:3000/health
```

---

## Limpiar todo

```bash
# Eliminar todos los manifests del proyecto
kubectl delete -k k8s/

# O eliminar el cluster entero
k3d cluster delete football-cluster
```

---

## De local a producción

Los mismos manifests funcionan en un cluster de AWS EKS, GKE o AKS. Solo cambia el kubeconfig:

```bash
# Apuntar a EKS (AWS)
aws eks update-kubeconfig --name mi-cluster --region us-east-1

# Aplicar los mismos YAMLs
kubectl apply -k k8s/
```

En producción ajustarías: StorageClass, resource limits, imagePullPolicy, y el Secret lo manejarías con External Secrets Operator o Sealed Secrets en vez de base64 plano.
