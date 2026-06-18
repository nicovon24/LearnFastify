# Kubernetes — De cero a un mini proyecto en local

## Por qué aprenderlo

Kubernetes está en el 90% de los job postings de backend/DevOps que piden algo más que Docker básico. Saber desplegar un proyecto real en K8s cambia el CV de "uso Docker" a "orquesto containers" — diferencia real en la lectura de un recruiter técnico. Y si ya tenés Docker en tu stack (lo usaste en AWS, en Spring Boot), la curva acá es más corta de lo que parece.

---

## El modelo mental más importante

**Kubernetes es declarativo.** Vos le decís cómo querés que esté el mundo (en un YAML), y K8s hace lo que sea necesario para llegar ahí y mantenerse ahí.

```
Imperativo (Docker):   docker run -p 3000:3000 mi-imagen
Declarativo (K8s):     "quiero 3 réplicas de mi-imagen corriendo siempre"
```

Si un container muere, lo reinicia. Si el tráfico sube, puede sumar réplicas. Vos describís el **estado deseado** y K8s trabaja continuamente para que la realidad coincida con tu declaración.

---

## Conceptos core (en orden de aprendizaje)

### Pod

La unidad mínima de K8s. Un Pod envuelve uno o más containers que comparten red y storage entre sí. En la práctica, la mayoría de los pods tienen **un solo container**. Un Pod es **efímero** — si muere, no vuelve solo.

```
Pod = wrapper de container(s)
Pod muere → desaparece para siempre
```

### Deployment

El recurso que usás siempre para correr tu app. Define la imagen, cuántas réplicas, y la estrategia de actualización. Si un Pod muere, el Deployment lo reemplaza automáticamente.

```yaml
spec:
  replicas: 3   # "quiero 3 Pods corriendo siempre"
```

Diferencia clave:
- `docker run` → vos corrés el container, vos lo reiniciás si muere
- Deployment → K8s garantiza que N réplicas estén corriendo en todo momento

### Service

Los Pods tienen IPs efímeras que cambian cada vez que mueren. Un Service da una **IP y DNS fijo** para llegar a un conjunto de Pods.

| Tipo | Acceso | Cuándo usarlo |
|------|--------|---------------|
| `ClusterIP` | Solo dentro del cluster | DBs, servicios internos |
| `NodePort` | Desde fuera del cluster vía puerto del nodo | Desarrollo, acceso directo |
| `LoadBalancer` | Balanceador externo en cloud | Producción en cloud |

### Ingress

Un router HTTP en el borde del cluster. Una sola entrada (puerto 80/443) que distribuye tráfico a distintos Services según URL o path.

```
curl http://localhost/api/players
  → Ingress Controller (nginx)
  → regla: /api → football-api-service
  → Pod del backend
```

Sin Ingress necesitarías un LoadBalancer por app (caro) o NodePorts distintos por app (un caos).

### ConfigMap y Secret

Configuración separada de la imagen Docker (principio 12-Factor App, factor III):

```
ConfigMap → config no sensible (PORT, DB_HOST, feature flags)
Secret    → credenciales (passwords, tokens, API keys)
```

La misma imagen va a staging y producción — solo cambia el ConfigMap/Secret del entorno.

> **Base64 NO es cifrado.** `echo -n "postgres" | base64` → `cG9zdGdyZXM=` — cualquiera puede revertirlo. En producción nunca commitees Secrets reales. Usá Sealed Secrets, External Secrets Operator, o SOPS.

### PersistentVolumeClaim (PVC)

Storage que sobrevive al ciclo de vida del Pod.

```
Sin PVC: Pod muere → nueva imagen vacía → datos de DB perdidos
Con PVC: Pod muere → nuevo Pod monta el mismo volumen → datos preservados
```

Analogía con Docker: `docker run -v /data/postgres:/var/lib/postgresql/data postgres`

### Namespace

Separación lógica dentro del cluster. En proyectos chicos usás `default`. En producción separarías por equipo o entorno (`staging`, `production`, `backend-team`).

### Health checks: liveness y readiness probes

```
liveness:  ¿el container sigue vivo?    → si falla N veces: REINICIAR
readiness: ¿está listo para tráfico?    → si falla: SACAR DEL BALANCEO (no reiniciar)
```

Ejemplo real:
- App arrancó (liveness = OK) pero la DB todavía no está lista (readiness = FAIL)
- K8s: "está vivo, no lo mato — pero tampoco le mando tráfico todavía"
- Cuando /health confirma que la DB conectó → readiness = OK → tráfico habilitado

### HPA (Horizontal Pod Autoscaler)

Escala automáticamente el número de réplicas según CPU/memoria. Si el tráfico sube, suma Pods. Si baja, los reduce. Es uno de los argumentos principales por los que la gente elige K8s.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 70
```

### Helm

El gestor de paquetes de K8s. En vez de gestionar 10 YAMLs a mano para instalar Postgres:

```bash
helm install postgresql bitnami/postgresql \
  --set auth.postgresPassword=secret
```

Para el proyecto de aprendizaje no lo necesitás, pero es lo primero que ves en entornos reales.

---

## Comandos kubectl esenciales

```bash
# Ver estado general
kubectl get pods                          # listar Pods
kubectl get pods -w                       # watch en tiempo real
kubectl get deployments                   # listar Deployments
kubectl get services                      # listar Services
kubectl get ingress                       # listar Ingress
kubectl get pvc                           # listar PersistentVolumeClaims

# Inspeccionar
kubectl describe pod <nombre>             # detalles y eventos del Pod (debugging)
kubectl describe deployment <nombre>
kubectl logs <pod-name>                   # logs del container
kubectl logs <pod-name> -f                # logs en tiempo real (follow)
kubectl logs <pod-name> --previous        # logs del run anterior (si crasheó)

# Ejecutar comandos dentro de un Pod
kubectl exec -it <pod-name> -- /bin/sh    # shell interactivo
kubectl exec -it <pod-name> -- psql -U postgres  # conectarse a Postgres

# Aplicar manifests
kubectl apply -f archivo.yaml             # aplicar un manifest
kubectl apply -f carpeta/                 # aplicar todos los YAMLs de una carpeta
kubectl apply -k k8s/                     # aplicar con Kustomize

# Eliminar
kubectl delete -f archivo.yaml
kubectl delete pod <nombre>               # K8s recrea el Pod automáticamente (si es un Deployment)
kubectl delete deployment <nombre>        # sí elimina definitivamente

# Contexto (para saber a qué cluster estás apuntando)
kubectl config current-context
kubectl config get-contexts
kubectl config use-context k3d-football-cluster
```

---

## Flujo de debugging

Cuando algo no funciona, el flujo es de afuera hacia adentro:

```
1. kubectl get pods           → ¿el Pod está Running? ¿CrashLoopBackOff?
2. kubectl describe pod XXX   → Events al final: ¿imagen no encontrada? ¿OOMKilled?
3. kubectl logs XXX           → ¿qué imprime la app? ¿error de conexión a DB?
4. kubectl exec -it XXX -- sh → entrar al container para debugging manual
```

### Estados de Pod comunes

| Estado | Qué significa |
|--------|--------------|
| `Running` | Todo bien |
| `Pending` | Esperando que el scheduler lo asigne a un nodo (o sin recursos) |
| `CrashLoopBackOff` | El container crashea y K8s lo reinicia en bucle — mirá logs |
| `ImagePullBackOff` | No puede bajar la imagen — verificá nombre y registry |
| `OOMKilled` | Superó el memory limit — subí el límite o hay memory leak |
| `Terminating` | Siendo eliminado |

---

## Roadmap de aprendizaje

**Semana 1 — La base:**
`kubectl` básico, primer Deployment y Service a mano con YAML, ciclo Pod → Deployment.

**Semana 2 — Config y redes:**
ConfigMaps, Secrets, env vars inyectadas, Ingress con ingress-nginx, diferencia ClusterIP/NodePort/LoadBalancer.

**Semana 3 — Storage y observabilidad:**
PVCs para que los datos sobrevivan reinicios, liveness/readiness probes, `kubectl logs`.

**Semana 4 — Helm y estructura real:**
Instalar un chart (PostgreSQL con Helm), estructura de un chart básico, diferencia entre YAMLs sueltos y Helm.

---

## De local a producción

Los mismos manifests que corren en k3d local funcionan en EKS (AWS), GKE (Google), o AKS (Azure) — solo cambia:

```bash
# Local (k3d)
kubectl config use-context k3d-football-cluster

# AWS EKS
aws eks update-kubeconfig --name mi-cluster --region us-east-1
kubectl config use-context arn:aws:eks:...

# Aplicar los mismos YAMLs
kubectl apply -k k8s/
```

Las diferencias en producción son de infraestructura (StorageClass, LoadBalancer real, DNS propio, TLS), no de los manifests de la app.

---

## Recursos recomendados

- [Kubernetes Docs oficiales](https://kubernetes.io/docs/home/) — la referencia
- [k3d docs](https://k3d.io/) — para el cluster local
- [Kustomize](https://kustomize.io/) — gestión de manifests sin Helm
- [Bitnami Helm charts](https://bitnami.com/stacks/helm) — charts de producción
- [Learn K8s](https://learnk8s.io/) — cursos y diagramas excelentes
