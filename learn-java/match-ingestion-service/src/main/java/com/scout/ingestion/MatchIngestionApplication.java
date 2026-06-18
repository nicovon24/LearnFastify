package com.scout.ingestion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Punto de entrada del microservicio de ingesta de eventos.
 *
 * @SpringBootApplication es una "meta-anotación" que combina tres anotaciones:
 *
 *   1. @Configuration: esta clase puede definir beans (componentes registrados
 *      en el contenedor de DI de Spring). Equivalente a un módulo en NestJS.
 *
 *   2. @EnableAutoConfiguration: Spring Boot escanea las dependencias en el
 *      classpath y configura automáticamente lo que encuentra. Por ejemplo,
 *      si detecta spring-kafka en el classpath, configura un KafkaTemplate
 *      sin que vos tengas que escribir ninguna configuración manual.
 *      Equivalente al "magic" que hace Nest con los módulos registrados.
 *
 *   3. @ComponentScan: escanea el paquete actual y subpaquetes buscando
 *      clases anotadas con @Component, @Service, @Controller, etc., y las
 *      registra en el contenedor de DI. Equivalente a que NestJS detecte
 *      automáticamente todos tus @Injectable() providers.
 *
 * Por qué está en el paquete raíz (com.scout.ingestion):
 *   El @ComponentScan escanea este paquete Y todos sus subpaquetes.
 *   Si la clase estuviera en un subpaquete, no encontraría los componentes
 *   de sus paquetes "hermanos".
 */
@SpringBootApplication
public class MatchIngestionApplication {

    public static void main(String[] args) {
        // SpringApplication.run() arranca el contexto de Spring:
        //   1. Escanea todos los @Component, @Service, etc.
        //   2. Los instancia e inyecta dependencias (DI)
        //   3. Levanta el servidor Tomcat embebido
        //   4. El proceso queda corriendo esperando requests HTTP
        SpringApplication.run(MatchIngestionApplication.class, args);
    }
}
