const express = require("express");
const app = express();
var csrf = require("tiny-csrf");
const bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
app.use(bodyParser.json());
const path = require("path");
const bcrypt=require('bcrypt');
const flash = require("connect-flash");
// const path = require("path");
app.set("views", path.join(__dirname, "views"));
const saltRounds=10;
const { Todo,User } = require("./models");
// eslint-disable-next-line no-unused-vars
const todo = require("./models/todo");
const passport=require('passport');
const connectEnsureLogin=require('connect-ensure-login');
const session=require('express-session');
const LocalStrategy=require('passport-local');
// const { next } = require("cheerio/lib/api/traversing");
app.use(session({
  secret:"my-super-scret-key-94916308928179609105",
  cookie:{
    maxAge:24*60*60*1000
  }
}))
app.use(passport.initialize());
app.use(passport.session());



app.use(flash());
app.use(function(req, res, next){
  res.locals.messages = req.flash();
  next();
});


passport.use(new LocalStrategy({
  usernameField:'email',
  passwordField:'password'
},(username,password,done)=>{
  // User.findOne({where:{email:username}})
  // .then(async(user)=>{
  //   const result=await bcrypt.compare(password,user.password);
  //   if(result){
  //     return done(null,user)
  //   }else{
  //     return done("Invalid Password");
  //   }
  // }).catch((error)=>{
  //   return (error)
  // })
  User.findOne({ where: { email: username } })
  .then(async function (user) {
    const result = await bcrypt.compare(password, user.password);
    if (result) {
      return done(null, user);
    } else {
      return done(null, false, { message: "Invalid password" });
    }
  })
  .catch((error) => {
    console.log(error);
    return done(null, false, {
      message: "Not Registered",
    });
  });
}))

passport.serializeUser((user,done)=>{
  console.log("Serializing user in session :",user.id);
  done(null,user.id);
})

passport.deserializeUser((id,done)=>{
  User.findByPk(id)
  .then(user=>{
    done(null,user)
  })
  .catch(error=>{
    done(error,null)
  })
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser("shh! some secret string"));
app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));

app.set("view engine", "ejs");




app.get("/", async (request, response) => {
    response.render("index", {
      title: "Todo Application",
      csrfToken: request.csrfToken(),
    });
});

app.get("/todo",connectEnsureLogin.ensureLoggedIn(),async (request, response) => {
  const loggedinUser=request.user.id;
  const allTodos = await Todo.getTodos();
  const overdue = await Todo.overdue(loggedinUser);
  const dueLater = await Todo.dueLater(loggedinUser);
  const dueToday = await Todo.dueToday(loggedinUser);
  const completedItems = await Todo.completedItems(loggedinUser);
  const user = await User.findByPk(loggedinUser);
  const userName = user.dataValues.firstName;
  console.log(user);
  if (request.accepts("html")) {
    response.render("todo", {
      title: "Todo Application",
      allTodos,
      overdue,
      dueLater,
      dueToday,
      completedItems,
      userName,
      csrfToken: request.csrfToken(),
    });
  } else {
    response.json(overdue, dueLater, dueToday, completedItems,userName);
  }
});

app.post("/users",async (request,response)=>{
  if (!request.body.email) {
    console.log("No email provided");
    request.flash("error", "Email can't be a null value");
    return response.redirect("/signup");
  }
  if (!request.body.firstName) {
    console.log("No name provided");
    request.flash("error", "Name can't be a null value");
    return response.redirect("/signup");
  }
  const user = await User.findOne({ where: { email: request.body.email } });
  if (user) {
    request.flash("error", "A user with this email address already exist");
    return response.redirect("/signup");
  }
  if (request.body.password.length < 8) {
    request.flash("error", "Password should be atleast 8 characters");
    return response.redirect("/signup");
  }
  const hashedPwd=await bcrypt.hash(request.body.password,saltRounds);
  try{
    const user=await User.create({
      firstName:request.body.firstName,
      lastName:request.body.lastName,
      email:request.body.email,
      password:hashedPwd,

    });
    request.login(user,(err)=>{
      if(err){
        console.log(err);
        response.redirect("/");
      }else{
        request.flash("success", "Sign up successful");
        response.redirect("/todo");
      }
      
    })
    
  }catch(err){
    request.flash("error", err.message);
    return response.redirect("/signup");

  }

})


app.get("/signup",(request,response)=>{
  response.render("signup",{title:"SignUp",csrfToken: request.csrfToken()})
})
app.get("/todos", async (request, response) => {
  // defining route to displaying message
  console.log("Todo list");
  try {
    const todoslist = await Todo.findAll();
    return response.json(todoslist);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.get("/login",(request,response)=>{
  response.render('login',{title:"Login",csrfToken: request.csrfToken()});
})

// app.post("/session",passport.authenticate('local',{failureRedirect:"/login"}),(request,response)=>{
//   response.redirect("/todo");
// })

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  function (request, response) {
    console.log(request.user);
    response.redirect("/todo");
  }
);

app.get("/signout",(request,response,next)=>{
  request.logout((err)=>{
    return next(err);
  })
  response.redirect("/");
})

app.get("/todos/:id",connectEnsureLogin.ensureLoggedIn(),async function (request, response) {
  try {
    const todo = await Todo.findByPk(request.params.id);
    return response.json(todo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.post("/todos",connectEnsureLogin.ensureLoggedIn(), async (request, response) => {
  if (request.body.title.length == 0) {
    request.flash("error", "Please enter a title");
    response.redirect("/todo");
  }
  if (request.body.dueDate.length == 0) {
    request.flash("error", "Todo dueDate can't be empty");
    return response.redirect("/todo");
  }
  // console.log("creating new todo", request.body);
  console.log(request.user)
  try {
    // eslint-disable-next-line no-unused-vars
    await Todo.addTodo({
      title: request.body.title,
      dueDate: request.body.dueDate,
      commpleted: false,
      userId:request.user.id
    });
    return response.redirect("/todo");
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});
//PUT https://mytodoapp.com/todos/123/markAscomplete
app.put("/todos/:id",connectEnsureLogin.ensureLoggedIn(), async (request, response) => {
  // console.log("Mark Todo as completed:", request.params.id);
  const todo = await Todo.findByPk(request.params.id);
  try {
    const updatedtodo = await todo.setCompletionStatus(request.body.completed);
    return response.json(updatedtodo);
  } catch (error) {
    console.log(error);
    return response.status(422).json(error);
  }
});

app.delete("/todos/:id",connectEnsureLogin.ensureLoggedIn(),async (request, response) => {
  // console.log("delete a todo with ID:", request.params.id);
  try {
    await Todo.remove(request.params.id,request.user.id);
    return response.json({ success: true });
  } catch (error) {
    return response.status(422).json(error);
  }
});
module.exports = app;
