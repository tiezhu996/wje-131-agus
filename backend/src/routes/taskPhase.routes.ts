import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../models/auditLog.entity';
import { SubTask } from '../models/subTask.entity';
import { TaskPhase } from '../models/taskPhase.entity';
import { TaskPhaseController } from '../controllers/taskPhase.controller';
import { AuditService } from '../services/audit.service';
import { TaskPhaseService } from '../services/taskPhase.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskPhase, SubTask, AuditLog])],
  controllers: [TaskPhaseController],
  providers: [TaskPhaseService, AuditService],
  exports: [TaskPhaseService]
})
export class TaskPhaseRoutesModule {}
