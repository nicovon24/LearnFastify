#!/usr/bin/env node
/**
 * bin/prodeazo-predictions-api.ts — Entry point de la aplicación CDK
 *
 * POR QUÉ este archivo existe separado del stack:
 *   CDK separa la APLICACIÓN (App) del STACK.
 *   - App: el contenedor raíz que puede tener múltiples stacks (ej: uno de dev, uno de prod)
 *   - Stack: la unidad de despliegue — un template de CloudFormation con recursos
 *
 *   Este archivo (el "bin") instancia la App y le agrega el stack.
 *   Equivalente al main() en otros frameworks — el punto de arranque.
 *
 * POR QUÉ CDK en vez de escribir CloudFormation YAML directamente:
 *   CDK te permite definir infraestructura en TypeScript con tipos, loops,
 *   funciones y todas las abstracciones del lenguaje. CDK genera el
 *   CloudFormation YAML/JSON por debajo (podés verlo con "cdk synth").
 *   El resultado final es el mismo (un template de CloudFormation),
 *   pero el código es mucho más mantenible.
 */

import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ProdeazoPredictionsStack } from "../lib/prodeazo-predictions-api-stack";

const app = new cdk.App();

new ProdeazoPredictionsStack(app, "ProdeazoPredictionsStack", {
  // env define la cuenta y región de AWS donde se despliega.
  // Para Floci local, la cuenta siempre es "000000000000" y la región us-east-1.
  // Para desplegar a AWS real: reemplazá con tu account ID y región real.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? "000000000000",
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  // Tags: metadatos que se aplican a TODOS los recursos del stack.
  // En AWS real, los tags permiten filtrar costos por proyecto en Cost Explorer.
  // POR QUÉ importante: con tags podés ver cuánto gasta "prodeazo" específicamente
  // sin mezclarlo con otros proyectos de la misma cuenta.
  tags: {
    Project: "prodeazo",
    Environment: "local",
  },
});
