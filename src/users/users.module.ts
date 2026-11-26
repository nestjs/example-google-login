import { Module } from '@nestjs/common';
import { IdentitiesRepository } from './identities.repository.js';
import { MeController } from './me.controller.js';
import { UsersRepository } from './users.repository.js';

@Module({
  controllers: [MeController],
  providers: [UsersRepository, IdentitiesRepository],
  exports: [UsersRepository, IdentitiesRepository],
})
export class UsersModule {}
