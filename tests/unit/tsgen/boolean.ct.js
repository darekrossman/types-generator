const builtinBoolean = {
  created_at: "2020-07-12T14:36:50.167Z",
  updated_at: "2020-07-12T14:37:02.250Z",
  title: "Boolean",
  uid: "boolean",
  _version: "number",
  inbuilt_class: false,
  schema: [
    {
      display_name: "Title",
      uid: "title",
      data_type: "text",
      mandatory: true,
      unique: true,
      field_metadata: {
        _default: true,
        version: 3,
      },
      multiple: false,
      non_localizable: false,
    },
    {
      data_type: "boolean",
      display_name: "Boolean",
      uid: "boolean",
      field_metadata: {
        description: "",
        default_value: "",
      },
      multiple: false,
      mandatory: false,
      unique: false,
      non_localizable: false,
    },
  ],
  last_activity: {},
  maintain_revisions: true,
  description: "",
  DEFAULT_ACL: {
    others: {
      read: false,
      create: false,
    },
    users: [
      {
        uid: "blta1a106c13958e89d",
        read: true,
        sub_acl: {
          read: true,
        },
      },
    ],
  },
  SYS_ACL: {
    roles: [
      {
        uid: "blt127263b8951e2542",
        read: true,
        sub_acl: {
          create: true,
          read: true,
          update: true,
          delete: true,
          publish: true,
        },
        update: true,
        delete: true,
      },
      {
        uid: "blt7e69bb0e63cc5fb6",
        read: true,
        sub_acl: {
          create: true,
          read: true,
          update: true,
          delete: true,
          publish: true,
        },
      },
      {
        uid: "bltb442c49a50c5804d",
        read: true,
        sub_acl: {
          create: true,
          read: true,
          update: true,
          delete: true,
          publish: true,
        },
        update: true,
        delete: true,
      },
    ],
    others: {
      read: false,
      create: false,
      update: false,
      delete: false,
      sub_acl: {
        read: false,
        create: false,
        update: false,
        delete: false,
        publish: false,
      },
    },
  },
  options: {
    is_page: false,
    singleton: true,
    title: "title",
    sub_title: [],
  },
  abilities: {
    get_one_object: true,
    get_all_objects: true,
    create_object: true,
    update_object: true,
    delete_object: true,
    delete_all_objects: true,
  },
};

module.exports = {
    builtinBoolean
}