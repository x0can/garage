const { db } = require("../util/admin");
const {
  validateCustomerData,
  validateRegOfVehicle,
} = require("../validator/validator");
const functions = require("firebase-functions");

let cusId;
exports.customerData = (request, response) => {
  const customerInfo = {
    email: request.body.email,
    name: request.body.name,
    phone: request.body.phone,
    vehicleCount: 0,
    customerId: 0,
    attendant: 0,
  };

  // const userData = db.collection('users')
  const { valid, errors } = validateCustomerData(customerInfo);
  if (!valid) return response.status(400).json(errors);
  db.collection("users")
    .where("userId", "==", request.params.userId)
    .get()
    .then((data) => {
      console.log(data.docs[0].data().username);
      if (!data.docs[0].exists) {
        return response.status(400).json({ error: "user not found" });
      }
      db.collection("customers")
        .where("email", "==", customerInfo.email)
        .get()
        .then((doc) => {
          if (doc.docs[0]) {
            return response
              .status(400)
              .json({ customer: "this customer already exists" });
          } else {
            db.collection("customers")
              .add(customerInfo)
              .then((test) => {
                newCustomer = customerInfo;
                newCustomer.customerId = test.id;
                newCustomer.attendant = data.docs[0].data().username;
                db.doc(`/customers/${test.id}`).update({
                  customerId: test.id + "",
                  attendant: data.docs[0].data().username + "",
                });

                return response.json(newCustomer);
              })
              .catch((err) => {
                console.error(err);
                return response.json({ error: err.code });
              });
          }
        });
    });
};

let vehicleId;
exports.vehicleData = (request, response) => {
  vehicleInfo = {
    customerId: request.params.customerId,
    model: request.body.model,
    registration: request.body.registration,
    createdAt: new Date().toISOString(),
  };

  const { valid, errors } = validateRegOfVehicle(vehicleInfo);
  let sender;

  if (!valid) return response.status(400).json(errors);
  db.collection("vehicles")
    .where("registration", "==", request.body.registration)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        db.doc(`/customers/${request.params.customerId}`)
          .get()
          .then((doc) => {
            if (!doc.exists) {
              return response
                .status(400)
                .json({ error: "Customer not registered" });
            }
            doc.ref.update({ vehicleCount: doc.data().vehicleCount + 1 });
            db.collection("vehicles")
              .add(vehicleInfo)
              .then((upd) => {
                vehicleInfo.vehicleId = upd.id;
                upd.update(vehicleInfo);
              })
              .then(() => {
                db.collection("vehicles")
                  .where("vehicleId", "==", `${vehicleInfo.vehicleId}`)
                  .onSnapshot((querySnapshot) => {
                    const notificationData = {};
                    notificationData.vehicleId = querySnapshot.docs[0].data().vehicleId;
                    notificationData.sender = doc.data().attendant;
                    return db
                      .doc(`notifications/${vehicleInfo.vehicleId}`)
                      .set(notificationData);
                  });
              })
              .catch((err) => {
                console.error(err);
                return response.json({ error: err.code });
              });
          })
          .then(() => {
            return response.json(vehicleInfo);
          })
          .catch((err) => {
            console.error(err);
            return response.json({ error: err.code });
          });
      } else {
        return response.json({ error: "Already exists" });
      }
    })

    .catch((err) => {
      console.error(err);
      return response.json({ error: err.code });
    });
};

exports.createNotification = (request, response) => {
  let notification = {
    username: request.body.username,
  };

  db.doc(`users/${request.body.username}`)
    .get()
    .then((res) => {
      if (!res.exists) return response.json({ error: "User not found" });

      if (res.data().role.trim() !== "mechanic")
        return response.json({ error: "User role not allowed" });
      db.doc(`notifications/${request.params.vehicleId}`)
        .get()
        .then((doc) => {
          console.log(doc.data());
          if (!doc.exists) return response.json({ error: "Vehicle not found" });

          if (doc.data().recepient)
            return response.json({
              error: `${doc.data().recepient} has already been notified`,
            });
          notificationData = doc.data();
          notificationData.recepient = res.data().username;
          notificationData.read = false;
          notificationData.createdAt = new Date().toISOString();
          return doc.ref.update(notificationData);
        })
        .then(() => {
          return response.json(notificationData);
        })
        .catch((err) => {
          console.error(err);
          return response.json({ error: err.code });
        });
    })

    .catch((err) => {
      console.error(err);
      return response.json({ error: err.code });
    });
};

exports.getCustomer = (request, response) => {
  let customerData = {};
  db.doc(`/customers/${request.params.customerId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return response.status(404).json({ error: "Customer not found" });
      }

      customerData = doc.data();
      customerData.customerId = doc.id;
      return db
        .collection("vehicles")
        .orderBy("createdAt", "desc")
        .where("customerId", "==", request.params.customerId)
        .get();
    })
    .then((data) => {
      customerData.vehicles = [];
      data.forEach((doc) => {
        // console.log(doc.data());
        customerData.vehicles.push(doc.data());
      });
      return response.json(customerData);
    })
    .catch((err) => {
      return response.status(500).json({ error: err.code });
    });
};

exports.getVehicle = (request, response) => {
  db.collection("vehicles")
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        return response.json(doc.data());
      });
    })
    .catch((err) => {
      console.log(err);
      return response.status(500).json({ error: "Something went wrong" });
    });
};
exports.getNotification = (request, response) => {
  let notificationData;
  recpientData = request.params.userId;
  db.collection("notifications")
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        recepients = doc.data().recepients;
        recepients.forEach((rec) => {
          // console.log(rec.userId)
          if (recpientData.trim() !== rec.userId.trim()) {
            return response.json({ error: "No notifications found" });
          }
          notificationData = doc.data();
          delete notificationData.recepients;
          return response.json(notificationData);
        });

        return response.json(doc.data());
      });
    })
    .catch((err) => {
      console.log(err);
      return response.status(500).json({ error: "Something went wrong" });
    });
};