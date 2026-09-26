import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubTask } from '../models/subTask.entity';
import { TaskPhase } from '../models/taskPhase.entity';
import { PhaseStatus, TaskStatus } from '../types/enums';
import { AuditService } from './audit.service';

@Injectable()
export class TaskPhaseService {
  constructor(
    @InjectRepository(TaskPhase) private readonly phaseRepository: Repository<TaskPhase>,
    @InjectRepository(SubTask) private readonly taskRepository: Repository<SubTask>,
    private readonly auditService: AuditService
  ) {}

  async findByProject(projectId: number) {
    return this.phaseRepository.find({ where: { projectId }, relations: ['subTasks'], order: { plannedStartDate: 'ASC' } });
  }

  async getById(id: number) {
    const phase = await this.phaseRepository.findOneBy({ id });
    if (!phase) {
      throw new NotFoundException('任务阶段不存在');
    }
    return phase;
  }

  async create(payload: Partial<TaskPhase>, actorId = 1) {
    const phase = await this.phaseRepository.save(this.phaseRepository.create(payload));
    await this.auditService.record('phase.create', 'TaskPhase', phase.id, actorId, payload);
    return phase;
  }

  async updateProgress(id: number, percentComplete: number, actorId = 1) {
    const phase = await this.getById(id);
    if (phase.status === PhaseStatus.Blocked) {
      throw new BadRequestException('阶段处于阻塞状态，请先解除阻塞再更新进度');
    }
    if (percentComplete < 0 || percentComplete > 100) {
      throw new BadRequestException('进度必须在 0 到 100 之间');
    }
    if (percentComplete >= 100) {
      const tasks = await this.taskRepository.find({ where: { phaseId: id } });
      const unfinished = tasks.filter((task) => task.status !== TaskStatus.Done).length;
      if (unfinished > 0) {
        throw new BadRequestException(`还有 ${unfinished} 个子任务未完成，阶段进度不能设为 100%`);
      }
      phase.percentComplete = 100;
      phase.status = PhaseStatus.Completed;
    } else {
      phase.percentComplete = percentComplete;
      phase.status = PhaseStatus.InProgress;
    }
    const updated = await this.phaseRepository.save(phase);
    await this.auditService.record('phase.progress.update', 'TaskPhase', id, actorId, { percentComplete });
    return updated;
  }

  async setBlocked(id: number, blocked: boolean, reason?: string, actorId = 1) {
    const phase = await this.getById(id);
    if (blocked) {
      const trimmed = reason?.trim();
      if (!trimmed) {
        throw new BadRequestException('阻塞阶段时必须填写阻塞原因');
      }
      phase.status = PhaseStatus.Blocked;
      phase.blockedReason = trimmed;
      const updated = await this.phaseRepository.save(phase);
      await this.auditService.record('phase.block', 'TaskPhase', id, actorId, { reason: trimmed });
      return updated;
    }
    phase.status = PhaseStatus.InProgress;
    phase.blockedReason = null;
    await this.phaseRepository.save(phase);
    await this.auditService.record('phase.unblock', 'TaskPhase', id, actorId);
    return this.syncCompletionWithSubTasks(id, actorId);
  }

  async syncCompletionWithSubTasks(phaseId: number, actorId = 1) {
    const phase = await this.getById(phaseId);
    if (phase.status === PhaseStatus.Blocked) {
      return phase;
    }
    const tasks = await this.taskRepository.find({ where: { phaseId } });
    const allDone = tasks.length > 0 && tasks.every((task) => task.status === TaskStatus.Done);
    if (allDone) {
      if (phase.status !== PhaseStatus.Completed || phase.percentComplete !== 100) {
        phase.status = PhaseStatus.Completed;
        phase.percentComplete = 100;
        await this.phaseRepository.save(phase);
        await this.auditService.record('phase.autoComplete', 'TaskPhase', phaseId, actorId, { percentComplete: 100 });
      }
      return phase;
    }
    if (phase.status === PhaseStatus.Completed) {
      const doneCount = tasks.filter((task) => task.status === TaskStatus.Done).length;
      phase.status = PhaseStatus.InProgress;
      phase.percentComplete = tasks.length ? Math.min(99, Math.floor((doneCount / tasks.length) * 100)) : 0;
      await this.phaseRepository.save(phase);
      await this.auditService.record('phase.completion.revert', 'TaskPhase', phaseId, actorId, {
        percentComplete: phase.percentComplete
      });
    }
    return phase;
  }
}
