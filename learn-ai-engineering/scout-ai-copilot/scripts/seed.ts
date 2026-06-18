/**
 * scripts/seed.ts — Poblar la base de datos con datos de prueba
 *
 * Cómo correrlo:
 *   npx tsx scripts/seed.ts
 *   (necesitás tener las variables de entorno seteadas en .env.local)
 *
 * Qué hace:
 *   1. Inserta 6 jugadores ficticios en la tabla `players`
 *   2. Inserta 6 reportes de scouting en `scouting_reports`, calculando
 *      el embedding de cada reporte con OpenAI y guardándolo en la columna vector
 */

import "dotenv/config";  // carga .env.local automáticamente
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ── Función helper: generar embedding de un texto ────────────────────────────
//
// Un "embedding" es un array de números (vector) que representa el SIGNIFICADO
// semántico del texto. Textos con significado similar tienen vectores similares.
// Eso es lo que nos permite hacer "buscar reportes parecidos a esta pregunta".
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",  // 1536 dimensiones, barato y bueno
    input: text,
  });
  return response.data[0].embedding;
}

// ── Datos de jugadores ───────────────────────────────────────────────────────

const players = [
  {
    name: "Marcos Villalba",
    position: "Mediocampista ofensivo",
    age: 22,
    team: "Atlético Norteño",
    goals: 8,
    assists: 12,
    matches: 28,
    minutes_played: 2340,
    pass_accuracy: 87.5,
    rating: 7.8,
  },
  {
    name: "Rodrigo Espinoza",
    position: "Delantero centro",
    age: 24,
    team: "Club Deportivo Sur",
    goals: 18,
    assists: 5,
    matches: 30,
    minutes_played: 2650,
    pass_accuracy: 72.3,
    rating: 8.1,
  },
  {
    name: "Lautaro Méndez",
    position: "Lateral derecho",
    age: 20,
    team: "Reserva Unión FC",
    goals: 2,
    assists: 9,
    matches: 25,
    minutes_played: 2100,
    pass_accuracy: 84.1,
    rating: 6.9,
  },
  {
    name: "Facundo Herrera",
    position: "Defensor central",
    age: 26,
    team: "Rivadavia SC",
    goals: 3,
    assists: 1,
    matches: 32,
    minutes_played: 2880,
    pass_accuracy: 91.2,
    rating: 7.5,
  },
  {
    name: "Sebastián Coria",
    position: "Extremo izquierdo",
    age: 21,
    team: "Los Cóndores FC",
    goals: 10,
    assists: 14,
    matches: 27,
    minutes_played: 2150,
    pass_accuracy: 79.8,
    rating: 7.6,
  },
  {
    name: "Diego Ferreira",
    position: "Volante defensive",
    age: 23,
    team: "Deportivo Central",
    goals: 1,
    assists: 6,
    matches: 31,
    minutes_played: 2790,
    pass_accuracy: 88.9,
    rating: 7.2,
  },
];

// ── Datos de reportes de scouting ────────────────────────────────────────────

const reports = [
  {
    player_name: "Marcos Villalba",
    scout_name: "Carlos Ruiz",
    date: "2024-03-15",
    content: `Marcos Villalba es un mediocampista con una visión de juego excepcional para su edad. 
Lo observé en tres partidos consecutivos y en todos demostró la misma consistencia: siempre pide la pelota, 
la recibe bajo presión y encuentra el pase correcto. Su capacidad para leer los espacios entre líneas es 
notablemente madura para alguien de 22 años.

En términos técnicos, su pie izquierdo es dominante pero no descuida el derecho. Hace combinaciones 
en reducidos con mucha fluidez y rara vez pierde la pelota en zonas de peligro. En los tres partidos 
observados completó más de 85 pases con una eficiencia superior al 90% en zona media.

El área de mejora más evidente es el despliegue físico. Cuando el partido exige presión alta y muchas 
transiciones, Villalba baja de intensidad notablemente en los últimos 20 minutos. También necesita 
trabajar el juego de cabeza — en duelos aéreos defensivos pierde con frecuencia. Con trabajo físico 
específico y experiencia en categorías más exigentes, tiene potencial para una liga de primer nivel.`,
  },
  {
    player_name: "Marcos Villalba",
    scout_name: "Patricia Gómez",
    date: "2024-05-02",
    content: `Segunda observación de Villalba, esta vez en un partido de mayor presión (clásico regional). 
Respondió muy bien a la exigencia: fue el mejor jugador de su equipo en la primera mitad, creando 4 situaciones 
de gol claras desde su posición. Su timing para salir a la presión también mejoró respecto a lo que 
vi en reportes anteriores.

Sin embargo, ratificó la debilidad física: en el segundo tiempo bajó notablemente. El entrenador lo 
cambió al minuto 72 aparentemente por ese motivo. Si resuelve el aspecto físico, podría dar el salto a 
una liga superior en el próximo mercado.`,
  },
  {
    player_name: "Rodrigo Espinoza",
    scout_name: "Miguel Torres",
    date: "2024-04-10",
    content: `Espinoza es un 9 de área clásico con un instinto goleador notable. Lo vi en dos partidos 
y marcó en ambos — uno de cabeza en un córner y uno de zurda en una contra rápida. Su posicionamiento 
dentro del área es muy inteligente: constantemente se desmarcan del central contrario aprovechando 
detalles de la línea defensiva.

El problema es su participación fuera del área: cuando el equipo necesita un 9 que baje a jugar, 
Espinoza aparece poco y pierde pelotas fáciles. Su porcentaje de pases (72%) refleja eso. Para equipos 
que juegan presión alta con el delantero participando en la recuperación, no es la opción ideal. 
Pero como goleador puro en un equipo ordenado tácticamente, tiene mucho valor.`,
  },
  {
    player_name: "Lautaro Méndez",
    scout_name: "Carlos Ruiz",
    date: "2024-02-28",
    content: `Méndez es un lateral derecho que promete mucho como proyectado. Su capacidad ofensiva 
es su punto más fuerte: llega al fondo con consistencia, centra bien con ambos pies y tiene muy buen 
timing para el uno-dos en banda. Sus 9 asistencias en 25 partidos son un número muy alto para un lateral.

El déficit es la marca. Cuando le toca defender uno contra uno contra extremos rápidos, se le va 
con facilidad. También tiene problemas con la lectura del fuera de juego — lo agarraron en posición 
adelantada más de lo aceptable. Con 20 años hay tiempo para corregirlo, pero necesita un cuerpo técnico 
que trabaje específicamente la fase defensiva.`,
  },
  {
    player_name: "Sebastián Coria",
    scout_name: "Patricia Gómez",
    date: "2024-04-22",
    content: `Coria es el jugador más desequilibrante que he visto en esta categoría en el último año. 
En banda izquierda es prácticamente imparable: tiene aceleración explosiva en corta distancia, 
conduce bien en espacios reducidos y tiene decisión rápida — no la la guarda de más ni la suelta 
antes de tiempo.

Sus estadísticas (10 goles, 14 asistencias en 27 partidos) son consistentes con lo que se ve: 
genera constantemente. El tema es su participación defensiva, que es mínima. Cuando el equipo 
no tiene la pelota, Coria prácticamente no trabaja hacia atrás, lo que genera un desequilibrio 
estructural en el costado izquierdo. Para cualquier equipo que quiera ficharlo necesita un lateral 
que compense eso.`,
  },
  {
    player_name: "Diego Ferreira",
    scout_name: "Miguel Torres",
    date: "2024-03-30",
    content: `Ferreira es el tipo de volante defensive que no ves en estadísticas pero que el equipo 
necesita. Su lectura del juego es muy buena: anticipa el pase antes de que se ejecute, llega a tiempo 
a las segundas pelotas y distribuye limpio con un 89% de precisión. En los dos partidos que vi, fue 
el jugador que más equilibrio le dio al equipo cuando no tenían la pelota.

No es un jugador de gol ni de asistencias — su valor está en el trabajo invisible. Para equipos que 
necesitan solidez en el medio y tienen atacantes creativos, Ferreira es ideal. Su desafío es el nivel 
físico: con 23 años debería tener más presencia en el sprint repetido. Sugiero evaluación física antes 
de confirmar cualquier oferta.`,
  },
];

// ── Seed principal ────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Iniciando seed de la base de datos...\n");

  // 1. Insertar jugadores
  console.log("📊 Insertando jugadores...");
  const { data: insertedPlayers, error: playersError } = await supabase
    .from("players")
    .insert(players)
    .select("id, name");

  if (playersError) {
    console.error("Error insertando jugadores:", playersError);
    process.exit(1);
  }

  console.log(`✅ ${insertedPlayers?.length} jugadores insertados`);

  // Creamos un mapa nombre → id para linkear los reportes
  const playerIdMap = new Map(
    insertedPlayers?.map((p: { id: string; name: string }) => [p.name, p.id])
  );

  // 2. Insertar reportes con embeddings
  console.log("\n📝 Generando embeddings e insertando reportes de scouting...");

  for (const report of reports) {
    process.stdout.write(`  Procesando reporte de ${report.player_name}... `);

    // Generamos el embedding del contenido del reporte
    // Este vector es lo que después vamos a comparar con el embedding de la pregunta del usuario
    const embedding = await generateEmbedding(report.content);

    const { error: reportError } = await supabase.from("scouting_reports").insert({
      player_id: playerIdMap.get(report.player_name),
      player_name: report.player_name,
      scout_name: report.scout_name,
      date: report.date,
      content: report.content,
      embedding,  // el array de 1536 números — pgvector lo guarda como tipo vector
    });

    if (reportError) {
      console.error(`\nError insertando reporte:`, reportError);
    } else {
      console.log("✅");
    }
  }

  console.log("\n🎉 Seed completado exitosamente!");
  console.log("Podés verificar los datos en: Supabase Dashboard → Table Editor");
}

seed().catch(console.error);
