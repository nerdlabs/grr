#!/usr/bin/env python
"""This modules contains tests for clients API handlers."""




from grr.gui import api_test_lib
from grr.gui.api_plugins import client as client_plugin

from grr.lib import aff4
from grr.lib import flags
from grr.lib import flow
from grr.lib import test_lib
from grr.lib.rdfvalues import client as rdf_client


class ApiAddClientsLabelsHandlerTest(test_lib.GRRBaseTest):
  """Test for ApiAddClientsLabelsHandler."""

  def setUp(self):
    super(ApiAddClientsLabelsHandlerTest, self).setUp()
    self.client_ids = self.SetupClients(3)
    self.handler = client_plugin.ApiAddClientsLabelsHandler()

  def testAddsSingleLabelToSingleClient(self):
    for client_id in self.client_ids:
      self.assertFalse(
          aff4.FACTORY.Open(client_id, token=self.token).GetLabels())

    self.handler.Handle(client_plugin.ApiAddClientsLabelsArgs(
        client_ids=[self.client_ids[0]],
        labels=["foo"]), token=self.token)

    labels = aff4.FACTORY.Open(self.client_ids[0],
                               token=self.token).GetLabels()
    self.assertEqual(len(labels), 1)
    self.assertEqual(labels[0].name, "foo")
    self.assertEqual(labels[0].owner, self.token.username)

    for client_id in self.client_ids[1:]:
      self.assertFalse(
          aff4.FACTORY.Open(client_id, token=self.token).GetLabels())

  def testAddsTwoLabelsToTwoClients(self):
    for client_id in self.client_ids:
      self.assertFalse(
          aff4.FACTORY.Open(client_id, token=self.token).GetLabels())

    self.handler.Handle(client_plugin.ApiAddClientsLabelsArgs(
        client_ids=[self.client_ids[0], self.client_ids[1]],
        labels=["foo", "bar"]), token=self.token)

    for client_id in self.client_ids[:2]:
      labels = aff4.FACTORY.Open(client_id, token=self.token).GetLabels()
      self.assertEqual(len(labels), 2)
      self.assertEqual(labels[0].name, "foo")
      self.assertEqual(labels[0].owner, self.token.username)
      self.assertEqual(labels[1].name, "bar")
      self.assertEqual(labels[1].owner, self.token.username)

    self.assertFalse(
        aff4.FACTORY.Open(self.client_ids[2], token=self.token).GetLabels())

  def testAuditEntryIsCreatedForEveryClient(self):
    self.handler.Handle(client_plugin.ApiAddClientsLabelsArgs(
        client_ids=self.client_ids,
        labels=["drei", "ein", "zwei"]), token=self.token)

    # We need to run .Simulate() so that the appropriate event is fired,
    # collected, and finally written to the logs that we inspect.
    mock_worker = test_lib.MockWorker(token=self.token)
    mock_worker.Simulate()

    parentdir = aff4.FACTORY.Open("aff4:/audit/logs", token=self.token)
    log = list(parentdir.ListChildren())[0]
    fd = aff4.FACTORY.Open(log, token=self.token)

    for client_id in self.client_ids:
      found_event = None
      for event in fd:
        if (event.action == flow.AuditEvent.Action.CLIENT_ADD_LABEL and
            event.client == rdf_client.ClientURN(client_id)):
          found_event = event
          break

      self.assertFalse(found_event is None)

      self.assertEqual(found_event.user, self.token.username)
      self.assertEqual(found_event.description, "test.drei,test.ein,test.zwei")


class ApiRemoveClientsLabelsHandlerTest(test_lib.GRRBaseTest):
  """Test for ApiRemoveClientsLabelsHandler."""

  def setUp(self):
    super(ApiRemoveClientsLabelsHandlerTest, self).setUp()
    self.client_ids = self.SetupClients(3)
    self.handler = client_plugin.ApiRemoveClientsLabelsHandler()

  def testRemovesUserLabelFromSingleClient(self):
    with aff4.FACTORY.Open(self.client_ids[0], mode="rw",
                           token=self.token) as grr_client:
      grr_client.AddLabels("foo", "bar")

    self.handler.Handle(
        client_plugin.ApiRemoveClientsLabelsArgs(
            client_ids=[self.client_ids[0]],
            labels=["foo"]),
        token=self.token)

    labels = aff4.FACTORY.Open(self.client_ids[0], token=self.token).GetLabels()
    self.assertEqual(len(labels), 1)
    self.assertEqual(labels[0].name, "bar")
    self.assertEqual(labels[0].owner, self.token.username)

  def testDoesNotRemoveSystemLabelFromSingleClient(self):
    with aff4.FACTORY.Open(self.client_ids[0], mode="rw",
                           token=self.token) as grr_client:
      grr_client.AddLabels("foo", owner="GRR")

    self.handler.Handle(
        client_plugin.ApiRemoveClientsLabelsArgs(
            client_ids=[self.client_ids[0]],
            labels=["foo"]),
        token=self.token)

    labels = aff4.FACTORY.Open(self.client_ids[0], token=self.token).GetLabels()
    self.assertEqual(len(labels), 1)

  def testRemovesUserLabelWhenSystemLabelWithSimilarNameAlsoExists(self):
    with aff4.FACTORY.Open(self.client_ids[0], mode="rw",
                           token=self.token) as grr_client:
      grr_client.AddLabels("foo")
      grr_client.AddLabels("foo", owner="GRR")

    self.handler.Handle(
        client_plugin.ApiRemoveClientsLabelsArgs(
            client_ids=[self.client_ids[0]],
            labels=["foo"]),
        token=self.token)

    labels = aff4.FACTORY.Open(self.client_ids[0], token=self.token).GetLabels()
    self.assertEqual(len(labels), 1)
    self.assertEqual(labels[0].name, "foo")
    self.assertEqual(labels[0].owner, "GRR")


class ApiSearchClientsHandlerRegressionTest(
    api_test_lib.ApiCallHandlerRegressionTest):

  handler = "ApiSearchClientsHandler"

  def Run(self):
    # Fix the time to avoid regressions.
    with test_lib.FakeTime(42):
      client_ids = self.SetupClients(1)

      # Delete the certificate as it's being regenerated every time the
      # client is created.
      with aff4.FACTORY.Open(client_ids[0], mode="rw",
                             token=self.token) as grr_client:
        grr_client.DeleteAttribute(grr_client.Schema.CERT)

      self.Check("GET", "/api/clients?query=%s" % client_ids[0].Basename())


class ApiGetClientHandlerRegressionTest(
    api_test_lib.ApiCallHandlerRegressionTest):

  handler = "ApiGetClientHandler"

  def Run(self):
    # Fix the time to avoid regressions.
    with test_lib.FakeTime(42):
      client_ids = self.SetupClients(1)

      # Delete the certificats as it's being regenerated every time the
      # client is created.
      with aff4.FACTORY.Open(client_ids[0], mode="rw",
                             token=self.token) as grr_client:
        grr_client.DeleteAttribute(grr_client.Schema.CERT)

    self.Check("GET", "/api/clients/%s" % client_ids[0].Basename())


class ApiListClientsLabelsHandlerRegressionTest(
    api_test_lib.ApiCallHandlerRegressionTest):

  handler = "ApiListClientsLabelsHandler"

  def Run(self):
    # Fix the time to avoid regressions.
    with test_lib.FakeTime(42):
      client_ids = self.SetupClients(2)

      with aff4.FACTORY.Open(client_ids[0], mode="rw",
                             token=self.token) as grr_client:
        grr_client.AddLabels("foo")

      with aff4.FACTORY.Open(client_ids[1], mode="rw",
                             token=self.token) as grr_client:
        grr_client.AddLabels("bar")

    self.Check("GET", "/api/clients/labels")


class ApiListKbFieldsHandlerTest(api_test_lib.ApiCallHandlerRegressionTest):

  handler = "ApiListKbFieldsHandler"

  def Run(self):
    self.Check("GET", "/api/clients/kb-fields")


class ApiCreateVfsRefreshOperationHandlerRegressionTest(
    api_test_lib.ApiCallHandlerRegressionTest):

  handler = "ApiCreateVfsRefreshOperationHandler"

  def Run(self):
    client_ids = self.SetupClients(1)
    # This creates client fixtures that include VFSDirectories.
    test_lib.ClientFixture(client_ids[0], token=self.token)

    self.Check(
        "POST",
        "/api/clients/%s/vfs-refresh-operations" % client_ids[0].Basename(),
        dict(vfs_path="non/existing", max_depth=1))

    self.Check(
        "POST",
        "/api/clients/%s/vfs-refresh-operations" % client_ids[0].Basename(),
        dict(vfs_path="fs/os/c", max_depth=1))


def main(argv):
  test_lib.main(argv)


if __name__ == "__main__":
  flags.StartMain(main)
