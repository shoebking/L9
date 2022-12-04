const request = require("supertest");
const cheerio = require("cheerio");

const db = require("../models/index");
const app = require("../app");

let server, agent;

function extractCsrfToken(res) {
  var $ = cheerio.load(res.text);
  return $("[name=_csrf]").val();
}

const login = async (agent, username, password) => {
  let res = await agent.get("/login");
  let csrfToken = extractCsrfToken(res);
  res = await agent.post("/session").send({
    email: username,
    password: password,
    _csrf: csrfToken,
  });
};

describe("List the todo items", function () {
  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    server = app.listen(3000, () => {});
    agent = request.agent(server);
  });

  afterAll(async () => {
    await db.sequelize.close();
    server.close();
  });

  test("Sign up user", async () => {
    let res = await agent.get("/signup");
    const csrfToken = extractCsrfToken(res);
    res = await agent.post("/users").send({
      firstName: "Test",
      lastName: "User A",
      email: "user.a@test.com",
      password: "12345678",
      _csrf: csrfToken,
    });
    expect(res.statusCode).toBe(302);
  });

  test("Sign out", async () => {
    let res = await agent.get("/todo");
    expect(res.statusCode).toBe(200);
    res = await agent.get("/signout");
    expect(res.statusCode).toBe(302);
    res = await agent.get("/todo");
    expect(res.statusCode).toBe(302);
  });

  test("create a todo", async () => {
    const agent = request.agent(server);
    await login(agent, "user.a@test.com", "12345678");

    const res = await agent.get("/todo");
    const csrfToken = extractCsrfToken(res);
    const response = await agent.post("/todo").send({
      title: "Buy milk",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });
    expect(response.statusCode).toBe(302);
  });

  test("Mark a todo as complete", async () => {
    const agent = request.agent(server);
    await login(agent, "user.a@test.com", "12345678");

    let res = await agent.get("/todo");
    let csrfToken = extractCsrfToken(res);

    const response = await agent.post("/todo").send({
      title: "Buy milk",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    const groupedTodosResponse = await agent
      .get("/todo")
      .set("Accept", "application/json");
    const parsedGroupedTodosResponse = JSON.parse(groupedTodosResponse.text);
    const dueTodayCount = parsedGroupedTodosResponse.today.length;
    const latestTodo = parsedGroupedTodosResponse.today[dueTodayCount - 1];

    res = await agent.get("/todo");
    csrfToken = extractCsrfToken(res);

    const markCompleteResponse = await agent
      .put(`/todo/${latestTodo.id}`)
      .send({
        completed: true,
        _csrf: csrfToken,
      });

    const parsedUpdateResponse = JSON.parse(markCompleteResponse.text);
    expect(parsedUpdateResponse.completed).toBe(true);
  });

  test("Delete todo using Id", async () => {
    const agent = request.agent(server);
    await login(agent, "user.a@test.com", "12345678");
    let res = await agent.get("/todo");
    let csrfToken = extractCsrfToken(res);

    const response = await agent.post("/todo").send({
      title: "Buy milk",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    const groupedTodosResponse = await agent
      .get("/todo")
      .set("Accept", "application/json");
    const parsedGroupedTodosResponse = JSON.parse(groupedTodosResponse.text);
    const dueTodayCount = parsedGroupedTodosResponse.today.length;
    const latestTodo = parsedGroupedTodosResponse.today[dueTodayCount - 1];

    const id = latestTodo.id;

    res = await agent.get("/todo");
    csrfToken = extractCsrfToken(res);

    const deleteTodo = await agent
      .delete(`/todo/${id}`)
      .send({ _csrf: csrfToken });

    const deleteTodoResponse = JSON.parse(deleteTodo.text);

    expect(deleteTodoResponse.success).toBe(true);
  });
});