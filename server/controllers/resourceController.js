export function resourceController(service, name) {
  return {
    list: (req, res) => res.json(service.list(name, req.query)),
    get: (req, res) => res.json({ data: service.get(name, req.params.id) }),
    create: (req, res) => {
      const data = service.create(name, req.body);
      res.location(`/api/${name}/${data.id}`).status(201).json({ data });
    },
    update: (req, res) => res.json({ data: service.update(name, req.params.id, req.body) }),
    remove: (req, res) => {
      service.remove(name, req.params.id);
      res.status(204).end();
    },
  };
}
