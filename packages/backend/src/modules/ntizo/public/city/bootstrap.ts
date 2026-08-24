import { DrizzleCityPublicRepository } from "./infra/repositories/drizzle/city-public.repository";
import { SearchCitiesProjection } from "./app/use-cases/search-cities.projection";
import type { CityPublicModule } from "./graphql/handlers/queries.handlers";

export function bootstrapCityPublic(): {
  adapters: { cityPublicRepository: DrizzleCityPublicRepository };
  useCases: CityPublicModule;
} {
  const cityPublicRepository = new DrizzleCityPublicRepository();
  return {
    adapters: { cityPublicRepository },
    useCases: { searchCities: new SearchCitiesProjection(cityPublicRepository) },
  };
}
