import { Alert, Button, Select, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { subTaskApi } from '../api/subTask';
import { StatusBadge } from '../components/common/StatusBadge';
import { UserAvatar } from '../components/common/UserAvatar';
import { useProject } from '../hooks/useProject';
import { useTaskStore } from '../stores/taskStore';
import { PhaseStatus, TaskStatus } from '../types';
import { formatDuration } from '../utils/formatDuration';

const columns = [TaskStatus.Todo, TaskStatus.InProgress, TaskStatus.Review, TaskStatus.Done];

export function TaskBoard() {
  const id = Number(useParams().id || 1);
  const { project } = useProject(id);
  const { phases, tasks, loadPhases } = useTaskStore();

  useEffect(() => {
    void loadPhases(id);
  }, [id, loadPhases]);

  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const blockedPhases = phases.filter((phase) => phase.status === PhaseStatus.Blocked);

  const moveTask = async (taskId: number, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    const phase = task ? phaseById.get(task.phaseId) : undefined;
    if (status === TaskStatus.Done && phase?.status === PhaseStatus.Blocked) {
      message.error(`阶段「${phase.name}」处于阻塞状态，解除阻塞后才能完成子任务`);
      return;
    }
    await subTaskApi.updateStatus(taskId, status);
    await loadPhases(id);
  };

  return (
    <>
      <div className="page-title">
        <div>
          <Typography.Title level={2}>{project?.name || '项目'} · 任务看板</Typography.Title>
          <Typography.Text type="secondary">按任务状态推进，现场负责人可直接更新流转状态</Typography.Text>
        </div>
        <Button type="primary">新增子任务</Button>
      </div>
      {blockedPhases.map((phase) => (
        <Alert
          key={phase.id}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`阶段「${phase.name}」已阻塞，其子任务暂不能标记完成`}
          description={phase.blockedReason ? `阻塞原因：${phase.blockedReason}` : '未填写阻塞原因'}
        />
      ))}
      <div className="board">
        {columns.map((status) => (
          <div className="board-column" key={status}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <StatusBadge value={status} />
              <Typography.Text type="secondary">{tasks.filter((task) => task.status === status).length}</Typography.Text>
            </Space>
            {tasks
              .filter((task) => task.status === status)
              .map((task) => {
                const phase = phaseById.get(task.phaseId);
                const phaseBlocked = phase?.status === PhaseStatus.Blocked;
                return (
                  <div className="task-card" key={task.id}>
                    <Typography.Text strong>{task.name}</Typography.Text>
                    <p>{task.description}</p>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Space size={8}>
                        <Typography.Text type="secondary">阶段：{phase?.name ?? '-'}</Typography.Text>
                        {phaseBlocked && <StatusBadge value={PhaseStatus.Blocked} />}
                      </Space>
                      <UserAvatar name={task.owner?.name} />
                      <Typography.Text type="secondary">
                        计划 {formatDuration(task.estimatedHours)} / 实际 {formatDuration(task.actualHours)}
                      </Typography.Text>
                      <Select
                        size="small"
                        value={task.status}
                        style={{ width: '100%' }}
                        options={columns.map((item) => ({
                          value: item,
                          label: item === TaskStatus.Done && phaseBlocked ? `${item}（阶段阻塞中）` : item,
                          disabled: item === TaskStatus.Done && phaseBlocked
                        }))}
                        onChange={(next) => void moveTask(task.id, next)}
                      />
                    </Space>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </>
  );
}
