import { FastifyInstance } from "fastify";
import { knex } from "../database";
import { randomUUID } from "node:crypto";
import z from "zod";
import { checkSessionIdExists } from "../middlewares/checkSession";

export function mealsRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const createMealBodySchema = z.object({
      name: z.string().max(100),
      description: z.string().max(200),
      date_hour: z.string().datetime(),
      is_diet: z.boolean().transform((val) => (val ? 1 : 0)),
    });

    const { name, description, date_hour, is_diet } = createMealBodySchema.parse(request.body);
    let sessionId = request.cookies.sessionId;

    if (!sessionId) {
      sessionId = randomUUID();
      reply.cookie('sessionId', sessionId, {
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      });
    }

    await knex('meals').insert({
      id: randomUUID(),
      name,
      description,
      date_hour,
      is_diet,
      session_id: sessionId,
    });

    return reply.status(201).send();
  });

  app.get('/', { preHandler: [checkSessionIdExists] } , async (request) => {
    const { sessionId } = request.cookies;

    const meals = await knex('meals')
      .where('session_id', sessionId)
      .select();

    return { meals };
  });

  app.get('/summary', { preHandler: [checkSessionIdExists] }, async (request) => {
    const { sessionId } = request.cookies;

    const rows = await knex('meals')
      .where('session_id', sessionId)
      .select('is_diet', 'date_hour')
      .orderBy('date_hour');

    const total = rows.length;
    const insideDiet = rows.filter((r) => r.is_diet === 1).length;
    const outsideDiet = total - insideDiet;

    let bestStreak = 0;
    let currentStreak = 0;
    for (const row of rows) {
      if (row.is_diet === 1) {
        currentStreak++;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }

    return {
      total,
      insideDiet,
      outsideDiet,
      bestStreak,
    };
  });

  app.get('/:id', { preHandler: [checkSessionIdExists] }, async (request) => {
    const getMealParamsSchema = z.object({
      id: z.uuid(),
    });

    const { sessionId } = request.cookies;
    const { id } = getMealParamsSchema.parse(request.params);

    const meal = await knex('meals')
      .where({
        id,
        session_id: sessionId,
      })
      .first();

      return { meal };
  });

  app.put('/:id', { preHandler: [checkSessionIdExists] }, async (request, reply) => {
    const updateMealParamsSchema = z.object({
      id: z.uuid(),
    });

    const updateMealBodySchema = z.object({
      name: z.string().max(100),
      description: z.string().max(200),
      date_hour: z.string().datetime(),
      is_diet: z.boolean().transform((val) => (val ? 1 : 0)),
    });

    const { sessionId } = request.cookies;
    const { id } = updateMealParamsSchema.parse(request.params);
    const { name, description, date_hour, is_diet } = updateMealBodySchema.parse(request.body);

    await knex('meals')
      .where({
        id,
        session_id: sessionId,
      })
      .update({
        name,
        description,
        date_hour,
        is_diet,
      });

      return reply.status(204).send();
  });

  app.delete('/:id', { preHandler: [checkSessionIdExists] }, async (request, reply) => {
    const { sessionId } = request.cookies;
    const { id } = z.object({ id: z.uuid() }).parse(request.params);

    await knex('meals')
      .where({
        id,
        session_id: sessionId,
      })
      .del();

    return reply.status(204).send();
  });
}
