package com.scout.aggregator.kafka;

import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.listener.ContainerProperties;

import java.util.HashMap;
import java.util.Map;

/**
 * Configuración del consumer de Kafka.
 *
 * POR QUÉ necesitamos esta clase si Spring Boot auto-configura Kafka:
 *   La auto-configuración de Spring Boot sirve para el caso simple (auto-commit).
 *   Para configurar acknowledgment MANUAL (at-least-once processing), necesitamos
 *   crear el ContainerFactory manualmente con AckMode.MANUAL_IMMEDIATE.
 *   Sin esto, el consumer haría auto-commit y podría perder mensajes si falla.
 *
 * @Configuration: equivalente a @Module de NestJS.
 *   Marca esta clase como fuente de definiciones de beans (@Bean).
 *
 * @Bean: equivalente a @Injectable() + registro en el módulo de NestJS.
 *   Le dice a Spring: "este método produce un objeto que debe ser registrado
 *   en el contenedor de DI y puede ser inyectado en otros componentes".
 */
@Configuration
public class KafkaConfig {

    @Value("${spring.kafka.bootstrap-servers:kafka:29092}")
    private String bootstrapServers;

    /**
     * ConsumerFactory: fábrica que crea instancias del consumidor de Kafka.
     * Recibe la configuración del consumer (bootstrap servers, deserializers, etc.)
     */
    @Bean
    public ConsumerFactory<String, String> consumerFactory() {
        Map<String, Object> props = new HashMap<>();

        // Dirección del broker de Kafka
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);

        // Group ID — identifica al consumer group. Todos los consumers con
        // este ID comparten la carga del topic.
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "stats-aggregator");

        // Deserializers: cómo convertir los bytes de Kafka a objetos Java.
        // StringDeserializer: bytes → String (lo opuesto al StringSerializer del producer)
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);

        // auto.offset.reset: qué hacer cuando el consumer group arranca por primera vez
        // (sin offset guardado) o cuando el offset expiró.
        //   "earliest": leer desde el principio del topic (todos los mensajes)
        //   "latest": leer solo mensajes nuevos (ignorar los anteriores al arranque)
        // Para el aggregator usamos "earliest" para no perdernos eventos anteriores.
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");

        // enable.auto.commit = false: deshabilitamos el auto-commit.
        // Con esto activado, Kafka haría commit del offset automáticamente cada N ms,
        // independientemente de si el mensaje fue procesado exitosamente.
        // Al deshabilitarlo, nosotros controlamos cuándo confirmar (ver acknowledgment.acknowledge())
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);

        return new DefaultKafkaConsumerFactory<>(props);
    }

    /**
     * ConcurrentKafkaListenerContainerFactory: crea los "containers" que
     * envuelven el @KafkaListener y manejan el ciclo de vida del consumer.
     * "Concurrent" significa que puede correr múltiples threads de consumo en paralelo.
     */
    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();

        factory.setConsumerFactory(consumerFactory());

        // AckMode.MANUAL_IMMEDIATE: el offset se confirma en Kafka INMEDIATAMENTE
        // cuando llamamos acknowledgment.acknowledge() en el listener.
        //
        // Alternativas:
        //   BATCH: confirma todos los mensajes del batch de una vez
        //   RECORD: confirma después de cada mensaje (similar a MANUAL pero automático)
        //   AUTO: confirma al terminar el método del listener
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);

        return factory;
    }
}
