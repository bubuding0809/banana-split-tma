import { createTRPCRouter } from "../../trpc.js";
import createSnapshot from "./createSnapshot.js";
import getSnapshots from "./getSnapshots.js";
import getSnapshotDetails from "./getSnapshotDetails.js";
import deleteSnapshot from "./deleteSnapshot.js";
import updateSnapshot from "./updateSnapshot.js";
import shareSnapshotMessage from "./shareSnapshotMessage.js";

export const snapshotRouter = createTRPCRouter({
  create: createSnapshot,
  getByChat: getSnapshots,
  getDetails: getSnapshotDetails,
  delete: deleteSnapshot,
  update: updateSnapshot,
  shareSnapshotMessage,
});
