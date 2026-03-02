# MaaEnd 远程控制 API 文档

版本号：1.2.0

## 概述

MaaEnd 远程控制 API 提供对本地 MaaEnd 客户端的远程管理功能，包括设备绑定、任务下发、状态查询、实时截图等功能。

- **Base URL**: `http://localhost:15618`
- **WebSocket URL**: `ws://localhost:15618`

---

## 认证说明

所有 MaaEnd API（除 WebSocket 设备连接端点外）支持以下两种认证方式：

### 方式一：JWT Access Token（Web 用户）

```http
Authorization: Bearer <jwt_access_token>
```

**获取方式**：
- 注册/登录 Web 平台
- OAuth 第三方登录

### 方式二：API Key（第三方客户端）

```http
X-API-Key: <your_api_key>
```

**获取方式**：
1. 登录 Web 平台
2. 进入「开发者设置」-「API Key 管理」
3. 创建新的 API Key，权限需包含 `maaend`

**API Key 权限要求**：
- 必须拥有 `maaend` 权限才能调用 MaaEnd API
- 可选设置 IP 白名单增强安全性

**适用场景**：
- 机器人/自动化脚本
- 第三方客户端集成
- 服务端调用

---

## 通用响应格式

```json
{
  "code": 0,
  "message": "成功",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 状态码，0 表示成功 |
| message | string | 状态消息 |
| data | object | 响应数据 |

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 40001 | 设备离线 |
| 40002 | 设备忙碌（正在执行任务） |

---

## 设备管理 API

### 生成绑定码

生成一个 6 位数字绑定码，用于 MaaEnd Client 绑定到当前用户账号。

```http
POST /api/maaend/devices/bind-code
Authorization: Bearer <token>
```

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "bind_code": "123456",
    "expires_in": 300,
    "expires_at": "2026-01-31T16:05:00+08:00"
  }
}
```

**响应字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| bind_code | string | 6 位数字绑定码 |
| expires_in | int | 有效期（秒），固定 300 秒 |
| expires_at | string | 过期时间（RFC3339 格式） |

**使用流程**：
1. 用户在 Web 端调用此接口获取绑定码
2. 在 MaaEnd Client 中输入绑定码
3. Client 通过 WebSocket 发送绑定请求
4. 绑定成功后，设备自动出现在设备列表中

---

### 获取设备列表

获取当前用户绑定的所有设备。

```http
GET /api/maaend/devices
Authorization: Bearer <token>
```

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "devices": [
      {
        "device_id": "dev_abc123",
        "device_name": "我的电脑",
        "status": "online",
        "maaend_version": "v1.6.6",
        "client_version": "v0.1.0",
        "os_info": "windows amd64 (Windows 10+)",
        "last_seen": "2026-01-31T16:00:00+08:00",
        "created_at": "2026-01-30T12:00:00+08:00",
        "current_job_id": "",
        "capabilities": {
          "tasks": ["RealTimeTask", "DailyRewards", "AutoResell"],
          "controllers": ["Win32", "Win32-Window", "Win32-Front", "ADB", "PlayCover"],
          "resources": ["官服", "B 服"]
        }
      }
    ],
    "count": 1
  }
}
```

**设备版本字段说明**：

| 字段 | 说明 |
|------|------|
| maaend_version | MaaEnd 核心版本号（来自 `interface.json`） |
| client_version | MaaEnd Client 远程控制客户端版本号 |

**设备状态**：

| 状态 | 说明 |
|------|------|
| online | 在线 |
| offline | 离线 |
| busy | 忙碌（正在执行任务） |

---

### 修改设备信息

修改设备名称等信息。

```http
PATCH /api/maaend/devices/:device_id
Authorization: Bearer <token>
Content-Type: application/json

{
  "device_name": "新设备名"
}
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_name | string | 是 | 新设备名称 |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "更新成功"
  }
}
```

---

### 删除设备

删除/解绑设备。

```http
DELETE /api/maaend/devices/:device_id
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "设备已删除"
  }
}
```

---

### 重置设备任务状态

用于恢复卡住的设备。当设备离线或任务异常时，可手动重置设备的任务状态。

```http
POST /api/maaend/devices/:device_id/reset
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**响应示例（有任务被清理）**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "设备任务状态已重置",
    "cleared_job_id": "job_abc123def456"
  }
}
```

**响应示例（无任务需清理）**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "设备任务状态已重置（无待清理任务）"
  }
}
```

**使用场景**：
- 设备意外断开连接，但后端仍显示设备"忙碌"
- 任务执行异常，无法正常完成或取消
- 客户端重启后，后端状态未同步

---

## 任务控制 API

### 获取设备可用任务

获取设备上报的可用任务列表及配置选项。

```http
GET /api/maaend/devices/:device_id/tasks
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "tasks": [
      {
        "name": "daily",
        "label": "日常任务",
        "description": "自动完成每日任务",
        "options": [
          {
            "name": "fight_mode",
            "type": "select",
            "label": "作战模式",
            "cases": [
              {"name": "auto", "label": "自动"},
              {"name": "manual", "label": "手动"}
            ],
            "default_case": "auto"
          }
        ]
      }
    ],
    "controllers": ["Win32.MuMu", "Win32.Official"],
    "resources": ["Official", "Bilibili"]
  }
}
```

**任务选项类型**：

| 类型 | 说明 |
|------|------|
| select | 单选，从 cases 中选择一个 |
| checkbox | 多选，从 cases 中选择多个 |
| input | 输入框，需要用户输入值 |

---

### 执行任务

向设备下发任务执行指令。

```http
POST /api/maaend/devices/:device_id/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "controller": "Win32.MuMu",
  "resource": "Official",
  "tasks": [
    {
      "name": "daily",
      "options": {
        "fight_mode": "auto"
      }
    },
    {
      "name": "recruit",
      "options": {}
    }
  ]
}
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| controller | string | 是 | 控制器名称 |
| resource | string | 是 | 资源名称 |
| tasks | array | 是 | 任务列表（至少 1 个） |
| tasks[].name | string | 是 | 任务名称 |
| tasks[].options | object | 否 | 任务选项 |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "job_id": "job_abc123def456",
    "message": "任务已下发"
  }
}
```

**错误响应**：

设备离线：
```json
{
  "code": 40001,
  "message": "设备离线，无法执行任务"
}
```

设备忙碌：
```json
{
  "code": 40002,
  "message": "设备正在执行任务: job_xyz789"
}
```

---

### 查询任务状态

查询任务执行状态和日志。

```http
GET /api/maaend/jobs/:job_id
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| job_id | string | 是 | 任务 ID |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "job_id": "job_abc123def456",
    "device_id": "dev_abc123",
    "device_name": "我的电脑",
    "status": "running",
    "current_task": "daily",
    "progress": {
      "completed": 1,
      "total": 3
    },
    "tasks": [
      {
        "name": "daily",
        "status": "completed",
        "options": {"fight_mode": "auto"}
      },
      {
        "name": "recruit",
        "status": "running",
        "options": {}
      }
    ],
    "logs": [
      {
        "time": "2026-01-31T16:00:00+08:00",
        "level": "info",
        "message": "任务开始: 日常任务",
        "node_name": "daily"
      }
    ],
    "error": "",
    "duration_ms": 12345,
    "started_at": "2026-01-31T16:00:00+08:00",
    "completed_at": "",
    "created_at": "2026-01-31T16:00:00+08:00"
  }
}
```

**任务状态**：

| 状态 | 说明 |
|------|------|
| pending | 等待执行 |
| running | 执行中 |
| completed | 已完成 |
| failed | 执行失败 |
| cancelled | 已取消 |

---

### 停止任务

停止正在执行的任务。

```http
POST /api/maaend/jobs/:job_id/stop
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| job_id | string | 是 | 任务 ID |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "已发送停止指令"
  }
}
```

---

### 获取任务历史

分页获取任务执行历史。

```http
GET /api/maaend/jobs
Authorization: Bearer <token>
```

**查询参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | int | 否 | 1 | 页码 |
| limit | int | 否 | 20 | 每页数量（最大 100） |
| device_id | string | 否 | - | 按设备筛选 |

**响应示例**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "jobs": [
      {
        "job_id": "job_abc123def456",
        "device_id": "dev_abc123",
        "device_name": "我的电脑",
        "status": "completed",
        "current_task": "",
        "progress": {"completed": 3, "total": 3},
        "error": "",
        "duration_ms": 45678,
        "started_at": "2026-01-31T16:00:00+08:00",
        "completed_at": "2026-01-31T16:00:45+08:00",
        "created_at": "2026-01-31T16:00:00+08:00"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

---

### 获取设备截图

获取设备当前屏幕截图。

```http
GET /api/maaend/devices/:device_id/screenshot
Authorization: Bearer <token>
```

**路径参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_id | string | 是 | 设备 ID |

**请求头**：

| Header | 值 | 说明 |
|--------|-----|------|
| Accept | application/json | 返回 JSON 格式（默认） |
| Accept | image/png | 返回图片二进制 |

**响应示例（JSON）**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "base64_image": "iVBORw0KGgoAAAANSUhEUgAA...",
    "width": 1920,
    "height": 1080,
    "captured_at": "2026-01-31T16:00:00+08:00"
  }
}
```

**响应示例（图片）**：

```
Content-Type: image/png
[PNG 图片二进制数据]
```

**注意**：设备必须在线且已连接控制器才能截图。

---

## WebSocket 端点

### MaaEnd Client 连接

MaaEnd Client 用于连接云端的 WebSocket 端点。

```
WS /ws/maaend
```

**无需认证**，但需要在连接后发送 `auth` 或 `register` 消息进行设备认证/注册。

#### 消息格式

所有消息采用 JSON 格式：

```json
{
  "type": "消息类型",
  "payload": { ... },
  "timestamp": "2026-01-31T16:00:00+08:00"
}
```

#### Client → Server 消息

**注册设备**：
```json
{
  "type": "register",
  "payload": {
    "bind_code": "123456",
    "device_name": "我的电脑",
    "maaend_version": "v1.6.6",
    "client_version": "v0.1.0",
    "maaend_path": "C:/MaaEnd",
    "os_info": "windows amd64 (Windows 10+)"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| bind_code | string | 是 | 6 位数字绑定码 |
| device_name | string | 是 | 设备名称 |
| maaend_version | string | 是 | MaaEnd 核心版本（来自 `interface.json`） |
| client_version | string | 是 | Client 远程控制客户端版本 |
| maaend_path | string | 是 | MaaEnd 安装路径 |
| os_info | string | 是 | 操作系统信息 |

**设备认证**：
```json
{
  "type": "auth",
  "payload": {
    "device_token": "已保存的设备令牌",
    "maaend_version": "v1.6.6",
    "client_version": "v0.1.0"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| device_token | string | 是 | 设备令牌（注册时获取） |
| maaend_version | string | 否 | MaaEnd 核心版本（可选，用于更新版本信息） |
| client_version | string | 否 | Client 版本（可选，用于更新版本信息） |

**上报设备能力**：
```json
{
  "type": "capabilities",
  "payload": {
    "tasks": [...],
    "controllers": ["Win32.MuMu"],
    "resources": ["Official"]
  }
}
```

**心跳**：
```json
{
  "type": "ping"
}
```

**任务状态上报**：
```json
{
  "type": "task_status",
  "payload": {
    "job_id": "job_abc123",
    "status": "running",
    "current_task": "daily",
    "progress": {"completed": 1, "total": 3},
    "message": "正在执行日常任务"
  }
}
```

**任务日志上报**：
```json
{
  "type": "task_log",
  "payload": {
    "job_id": "job_abc123",
    "level": "info",
    "message": "识别成功: 开始战斗",
    "node_name": "start_battle",
    "event_type": "node"
  }
}
```

**任务完成上报**：
```json
{
  "type": "task_completed",
  "payload": {
    "job_id": "job_abc123",
    "status": "completed",
    "error": "",
    "duration_ms": 45678
  }
}
```

**截图上报**：
```json
{
  "type": "screenshot",
  "payload": {
    "request_id": "req_xyz",
    "base64_image": "iVBORw0KGgoAAAANSUhEUgAA...",
    "width": 1920,
    "height": 1080
  }
}
```

#### Server → Client 消息

**注册成功**：
```json
{
  "type": "registered",
  "payload": {
    "device_id": "dev_abc123",
    "device_token": "保存此令牌用于下次认证"
  }
}
```

**认证成功**：
```json
{
  "type": "authenticated",
  "payload": {
    "device_id": "dev_abc123",
    "user_nickname": "用户昵称"
  }
}
```

**认证失败**：
```json
{
  "type": "auth_failed",
  "payload": {
    "error": "invalid_token",
    "message": "设备令牌无效"
  }
}
```

**心跳响应**：
```json
{
  "type": "pong"
}
```

**执行任务**：
```json
{
  "type": "run_task",
  "payload": {
    "job_id": "job_abc123",
    "controller": "Win32.MuMu",
    "resource": "Official",
    "tasks": [
      {"name": "daily", "options": {"fight_mode": "auto"}}
    ]
  }
}
```

**停止任务**：
```json
{
  "type": "stop_task",
  "payload": {
    "job_id": "job_abc123"
  }
}
```

**请求截图**：
```json
{
  "type": "request_screenshot",
  "payload": {
    "request_id": "req_xyz"
  }
}
```

**错误通知**：
```json
{
  "type": "error",
  "payload": {
    "code": "task_failed",
    "message": "任务执行失败"
  }
}
```

---

### 用户实时推送

用户端接收设备状态、任务进度等实时推送。

```
WS /api/maaend/ws
Authorization: Bearer <token>
```

**需要 JWT 认证**，认证方式：
- Query 参数: `?token=<jwt_token>`
- 或在连接后发送认证消息

#### Server → User 推送消息

**设备上线**：
```json
{
  "type": "device_online",
  "device_id": "dev_abc123",
  "device_name": "我的电脑"
}
```

**设备离线**：
```json
{
  "type": "device_offline",
  "device_id": "dev_abc123",
  "device_name": "我的电脑"
}
```

**任务状态更新**：
```json
{
  "type": "task_status",
  "job_id": "job_abc123",
  "device_id": "dev_abc123",
  "status": "running",
  "current_task": "daily",
  "progress": {"completed": 1, "total": 3},
  "message": "正在执行日常任务"
}
```

**任务日志**：
```json
{
  "type": "task_log",
  "job_id": "job_abc123",
  "device_id": "dev_abc123",
  "level": "info",
  "message": "识别成功: 开始战斗",
  "node_name": "start_battle"
}
```

**任务完成**：
```json
{
  "type": "task_completed",
  "job_id": "job_abc123",
  "device_id": "dev_abc123",
  "status": "completed",
  "duration_ms": 45678
}
```

---

## 数据模型

### Device 设备

```typescript
interface Device {
  device_id: string;           // 设备唯一标识
  device_name: string;         // 设备名称
  status: "online" | "offline" | "busy";  // 设备状态
  maaend_version: string;      // MaaEnd 核心版本（来自 interface.json）
  client_version: string;      // Client 远程控制客户端版本
  os_info: string;             // 操作系统信息
  last_seen: string;           // 最后在线时间
  created_at: string;          // 创建时间
  current_job_id: string;      // 当前执行的任务ID
  capabilities: {
    tasks: string[];           // 可用任务名称列表
    controllers: string[];     // 可用控制器列表
    resources: string[];       // 可用资源列表
  };
}
```

### Job 任务

```typescript
interface Job {
  job_id: string;              // 任务唯一标识
  device_id: string;           // 设备ID
  device_name: string;         // 设备名称
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_task: string;        // 当前执行的任务名
  progress: {
    completed: number;         // 已完成任务数
    total: number;             // 总任务数
  };
  tasks: TaskItem[];           // 任务列表
  logs: LogItem[];             // 执行日志
  error: string;               // 错误信息
  duration_ms: number;         // 执行耗时（毫秒）
  started_at: string;          // 开始时间
  completed_at: string;        // 完成时间
  created_at: string;          // 创建时间
}

interface TaskItem {
  name: string;                // 任务名称
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  options: Record<string, any>; // 任务选项
}

interface LogItem {
  time: string;                // 时间
  level: "debug" | "info" | "warn" | "error";
  message: string;             // 日志内容
  node_name: string;           // 节点名称
  event_type: string;          // 事件类型
}
```

### TaskInfo 任务信息

```typescript
interface TaskInfo {
  name: string;                // 任务名称
  label: string;               // 显示名称
  description: string;         // 描述
  options: OptionInfo[];       // 可配置选项
}

interface OptionInfo {
  name: string;                // 选项名称
  type: "select" | "checkbox" | "input";
  label: string;               // 显示名称
  cases: CaseInfo[];           // 可选项（select/checkbox）
  default_case: string;        // 默认值
}

interface CaseInfo {
  name: string;                // 选项值
  label: string;               // 显示名称
}
```

---

## API 端点汇总

| 方法 | 路径 | 功能 | 认证 |
|------|------|------|------|
| POST | `/api/maaend/devices/bind-code` | 生成绑定码 | JWT / API Key |
| GET | `/api/maaend/devices` | 获取设备列表 | JWT / API Key |
| PATCH | `/api/maaend/devices/:device_id` | 修改设备信息 | JWT / API Key |
| DELETE | `/api/maaend/devices/:device_id` | 删除设备 | JWT / API Key |
| POST | `/api/maaend/devices/:device_id/reset` | 重置任务状态 | JWT / API Key |
| GET | `/api/maaend/devices/:device_id/tasks` | 获取可用任务 | JWT / API Key |
| POST | `/api/maaend/devices/:device_id/tasks` | 执行任务 | JWT / API Key |
| GET | `/api/maaend/devices/:device_id/screenshot` | 获取截图 | JWT / API Key |
| GET | `/api/maaend/jobs/:job_id` | 查询任务状态 | JWT / API Key |
| POST | `/api/maaend/jobs/:job_id/stop` | 停止任务 | JWT / API Key |
| GET | `/api/maaend/jobs` | 任务历史列表 | JWT / API Key |
| WS | `/ws/maaend` | Client 连接 | 无（连接后认证） |
| WS | `/api/maaend/ws` | 用户实时推送 | JWT / API Key |

**API Key 权限要求**：需要 `maaend` 权限

---

## 更新日志

### v1.2.0 (2026-01-31)

- ✅ **设备版本信息增强**
  - 设备列表响应新增 `client_version` 字段（Client 远程控制客户端版本）
  - `maaend_version` 来自 MaaEnd 核心的 `interface.json`
  - 注册和认证消息都支持上报双版本信息

- ✅ **新增重置设备任务状态 API**
  - `POST /api/maaend/devices/:device_id/reset`
  - 用于恢复卡住的设备，清理异常任务状态
  - 设备离线重连后可手动重置状态

- ✅ **WebSocket 协议更新**
  - `register` 消息新增 `client_version` 字段
  - `auth` 消息新增 `maaend_version` 和 `client_version` 可选字段
  - 认证时可同步更新设备版本信息

### v1.1.0 (2026-01-31)

- ✅ 初始版本发布
- ✅ 设备绑定、认证、任务控制
- ✅ WebSocket 双向通信
- ✅ 实时截图、日志推送

---

*文档版本: 1.2.0*
*创建日期: 2026-01-31*
*最后更新: 2026-01-31*
