package com.scout.ingestion.model;

/**
 * Enum: tipo de evento de partido.
 *
 * POR QUÉ enum en vez de String:
 *   En Java, los enums son tipos de primera clase — el compilador y la JVM
 *   los conocen. Si usaras String, podrías pasar "GOALL" (typo) y el
 *   compilador no se daría cuenta. Con un enum, si no es GOAL/CARD/SUBSTITUTION,
 *   directamente no compila (o falla en deserialización antes de llegar a tu código).
 *
 *   Jackson (la librería de JSON) deserializa automáticamente strings como
 *   "GOAL" al enum EventType.GOAL. Si el string no matchea ningún valor,
 *   devuelve un error 400 antes de que el código del controller se ejecute.
 *
 * COMPARACIÓN CON TS:
 *   En TypeScript usarías: type EventType = 'GOAL' | 'CARD' | 'SUBSTITUTION'
 *   En Java, el enum es más potente — puede tener campos, métodos, y es un
 *   tipo real que se puede pasar como parámetro, no solo un string literal.
 */
public enum EventType {
    GOAL,           // Gol anotado
    CARD,           // Tarjeta amarilla o roja
    SUBSTITUTION    // Cambio de jugador
}
